import { getClerkInstance } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { api } from "@vyra/backend/convex/_generated/api"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionArgs } from "convex/server"
import Constants from "expo-constants"
import type { SQLiteDatabase } from "expo-sqlite"
import { clerkKey, convexUrl, isConfigured } from "../env"
import { db, LEGACY_OWNER, write } from "./db"
import { notify } from "./events"
import { backoffMs, isPermanent } from "./rules"

/** One queued Convex call. Rows are sent strictly in id order, so start, chunks and finish keep their order. */
export type OutboxCall =
  | { kind: "start"; args: FunctionArgs<typeof api.trips.start> }
  | { kind: "chunk"; args: FunctionArgs<typeof api.trips.appendChunk> }
  | { kind: "finish"; args: FunctionArgs<typeof api.trips.finish> }

type OutboxRow = {
  id: number
  client_id: string
  kind: OutboxCall["kind"]
  args: string
  attempts: number
  next_at: number
  owner: string | null
}

/** Queues a call. Pass the transaction when the call must commit together with other writes. */
export const enqueue = (tx: SQLiteDatabase, call: OutboxCall) =>
  tx.runAsync("INSERT INTO outbox (client_id, kind, args) VALUES (?, ?, ?)", call.args.clientId, call.kind, JSON.stringify(call.args))

function send(client: ConvexHttpClient, call: OutboxCall) {
  switch (call.kind) {
    case "start":
      return client.mutation(api.trips.start, call.args)
    case "chunk":
      return client.mutation(api.trips.appendChunk, call.args)
    case "finish":
      return client.mutation(api.trips.finish, call.args)
  }
}

let clerkLoad: Promise<void> | undefined

/**
 * The signed-in Clerk user and a fresh Convex token, or null while Clerk is not loaded or nobody is signed in.
 * A headless background launch mounts no ClerkProvider, so there this loads Clerk once with the provider's key and token cache.
 * In the app, the provider loads Clerk. Clerk has no guard against a second load in parallel, so this does not load it there.
 */
async function session() {
  const clerk = getClerkInstance({ publishableKey: clerkKey, tokenCache })
  if (!clerk.loaded && Constants.isHeadless) {
    // ClerkProvider passes standardBrowser: false on native. The default expects a browser.
    clerkLoad ??= clerk.load({ standardBrowser: false }).catch((e: unknown) => {
      clerkLoad = undefined
      throw e
    })
    await clerkLoad
  }
  if (!clerk.loaded) return null
  const userId = clerk.user?.id
  const token = await clerk.session?.getToken({ template: "convex" })
  return userId && token ? { userId, token } : null
}

let running: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Sends queued calls of the signed-in user's trips in order until none are left or a call fails.
 * Calls of trips with another owner or no owner stay on the phone.
 * A failed call blocks the queue until its backoff ends. `force` skips the wait, for foreground and network return.
 * Safe to call often: it does one SELECT when there is nothing to send.
 */
export function flush(force = false): Promise<void> {
  if (!isConfigured) return Promise.resolve()
  // A forced flush during a normal one could find the queue waiting on backoff, so it runs again after.
  if (running && force) return running.then(() => flush(true))
  running ??= drain(force)
    .catch((e: unknown) => console.warn("outbox flush failed", e))
    .finally(() => {
      running = null
    })
  return running
}

async function drain(force: boolean) {
  let client: ConvexHttpClient | null = null
  for (;;) {
    // The account table mirrors Clerk. The session check below still guards against a stale mirror.
    const row = await db.getFirstAsync<OutboxRow>(
      `SELECT outbox.*, trips.owner FROM outbox JOIN trips USING (client_id)
       WHERE trips.owner = (SELECT user_id FROM account WHERE id = 1) ORDER BY outbox.id LIMIT 1`,
    )
    if (!row || (!force && row.next_at > Date.now())) break
    if (!client) {
      const auth = await session()
      if (!auth || auth.userId !== row.owner) return
      client = new ConvexHttpClient(convexUrl)
      client.setAuth(auth.token)
    }
    const args: unknown = JSON.parse(row.args)
    // The network call runs outside the write queue. Only the SQLite writes after it go through write().
    try {
      await send(client, { kind: row.kind, args } as OutboxCall)
      await write(async (tx) => {
        await tx.runAsync("DELETE FROM outbox WHERE id = ?", row.id)
        await tx.runAsync("UPDATE trips SET last_error = NULL WHERE client_id = ?", row.client_id)
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (isPermanent(e)) {
        await write(async (tx) => {
          await tx.runAsync("DELETE FROM outbox WHERE id = ?", row.id)
          await tx.runAsync("UPDATE trips SET failed = ? WHERE client_id = ?", message, row.client_id)
        })
      } else {
        const delay = backoffMs(row.attempts + 1)
        await write(async (tx) => {
          await tx.runAsync("UPDATE outbox SET attempts = attempts + 1, next_at = ? WHERE id = ?", Date.now() + delay, row.id)
          await tx.runAsync("UPDATE trips SET last_error = ? WHERE client_id = ?", message, row.client_id)
        })
        clearTimeout(retryTimer)
        // Timers may not run in the background. Location updates call flush() there too.
        retryTimer = setTimeout(() => void flush(), delay)
        notify()
        return
      }
    }
    notify()
  }
  await removeUploaded()
  notify()
}

/** Deletes finished trips that have nothing left to send and no hard failure. */
const removeUploaded = () =>
  write((tx) =>
    tx.execAsync(`
      DELETE FROM points WHERE client_id IN (
        SELECT client_id FROM trips WHERE ended_at IS NOT NULL AND failed IS NULL
        AND client_id NOT IN (SELECT client_id FROM outbox));
      DELETE FROM trips WHERE ended_at IS NOT NULL AND failed IS NULL
        AND client_id NOT IN (SELECT client_id FROM outbox);
    `),
  )

/** Removes a local trip with its points and queued calls. For trips that failed to upload or have no owner. */
export async function deleteLocalTrip(clientId: string) {
  await write(async (tx) => {
    for (const table of ["outbox", "points", "trips"]) await tx.runAsync(`DELETE FROM ${table} WHERE client_id = ?`, clientId)
  })
  notify()
}

/**
 * Saves the signed-in Clerk user, or null after sign-out. The root layout calls it on every auth change.
 * New trips take this user as owner, and flush() sends only this user's trips.
 */
export async function setAccount(userId: string | null) {
  await write(async (tx) => {
    await tx.runAsync("INSERT OR REPLACE INTO account (id, user_id) VALUES (1, ?)", userId)
    // Finds rows only on the first call after the owner migration. That call sees the session restored from before the update.
    await tx.runAsync("UPDATE trips SET owner = ? WHERE owner = ?", userId, LEGACY_OWNER)
  })
  notify()
}

/** Gives a trip recorded while nobody was signed in to the signed-in user, then uploads it. Call it only after the user confirms. */
export async function claimTrip(clientId: string) {
  await write(async (tx) => {
    await tx.runAsync("UPDATE trips SET owner = (SELECT user_id FROM account WHERE id = 1) WHERE client_id = ? AND owner IS NULL", clientId)
  })
  notify()
  await flush(true)
}
