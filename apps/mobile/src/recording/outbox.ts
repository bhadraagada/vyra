import { getClerkInstance } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { api } from "@vyra/backend/convex/_generated/api"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionArgs } from "convex/server"
import type { SQLiteDatabase } from "expo-sqlite"
import { clerkKey, convexUrl, isConfigured } from "../env"
import { db } from "./db"
import { notify } from "./events"
import { backoffMs, isPermanent } from "./rules"

/** One queued Convex call. Rows are sent strictly in id order, so start, chunks and finish keep their order. */
export type OutboxCall =
  | { kind: "start"; args: FunctionArgs<typeof api.trips.start> }
  | { kind: "chunk"; args: FunctionArgs<typeof api.trips.appendChunk> }
  | { kind: "finish"; args: FunctionArgs<typeof api.trips.finish> }

type OutboxRow = { id: number; client_id: string; kind: OutboxCall["kind"]; args: string; attempts: number; next_at: number }

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

/** A fresh Convex token from Clerk, or null while Clerk is not loaded or nobody is signed in. */
async function convexToken() {
  const clerk = getClerkInstance({ publishableKey: clerkKey, tokenCache })
  if (!clerk.loaded) return null
  return (await clerk.session?.getToken({ template: "convex" })) ?? null
}

let running: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Sends queued calls in order until the queue is empty or a call fails.
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
    const row = await db.getFirstAsync<OutboxRow>("SELECT * FROM outbox ORDER BY id LIMIT 1")
    if (!row || (!force && row.next_at > Date.now())) break
    if (!client) {
      const token = await convexToken()
      if (!token) return
      client = new ConvexHttpClient(convexUrl)
      client.setAuth(token)
    }
    const args: unknown = JSON.parse(row.args)
    try {
      await send(client, { kind: row.kind, args } as OutboxCall)
      await db.runAsync("DELETE FROM outbox WHERE id = ?", row.id)
      await db.runAsync("UPDATE trips SET last_error = NULL WHERE client_id = ?", row.client_id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (isPermanent(e)) {
        await db.runAsync("DELETE FROM outbox WHERE id = ?", row.id)
        await db.runAsync("UPDATE trips SET failed = ? WHERE client_id = ?", message, row.client_id)
      } else {
        const delay = backoffMs(row.attempts + 1)
        await db.runAsync("UPDATE outbox SET attempts = attempts + 1, next_at = ? WHERE id = ?", Date.now() + delay, row.id)
        await db.runAsync("UPDATE trips SET last_error = ? WHERE client_id = ?", message, row.client_id)
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
  db.execAsync(`
    DELETE FROM points WHERE client_id IN (
      SELECT client_id FROM trips WHERE ended_at IS NOT NULL AND failed IS NULL
      AND client_id NOT IN (SELECT client_id FROM outbox));
    DELETE FROM trips WHERE ended_at IS NOT NULL AND failed IS NULL
      AND client_id NOT IN (SELECT client_id FROM outbox);
  `)

/** Removes a local trip that failed to upload, with its points and queued calls. */
export async function deleteLocalTrip(clientId: string) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const table of ["outbox", "points", "trips"]) await tx.runAsync(`DELETE FROM ${table} WHERE client_id = ?`, clientId)
  })
  notify()
}
