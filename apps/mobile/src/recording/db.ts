import * as SQLite from "expo-sqlite"
import type { SQLiteDatabase } from "expo-sqlite"
import type { GpsPoint, StartSource, StopReason } from "@vyra/core"
import { retryBusy } from "./rules"

/**
 * Local store. Every point lands here before any upload, so a dead zone or an app kill loses nothing.
 * - trips: local trips until all their outbox calls are sent. Then the trip and its points are deleted.
 *   owner is the Clerk user ID that was signed in when the trip started. It is null if nobody was, or if the trip
 *   is older than owners, until the user confirms the upload with claimTrip().
 * - points: GPS points. seq is null until the point is in an outbox chunk.
 * - outbox: Convex calls in send order (id).
 * - machine: the one persisted trip machine row.
 * - account: the signed-in Clerk user ID, mirrored by the root layout. Background starts read it.
 */
export const db = SQLite.openDatabaseSync("vyra.db")

db.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS trips (
  client_id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  start_source TEXT NOT NULL,
  stop_reason TEXT,
  vehicle_key TEXT,
  next_seq INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  failed TEXT
);
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  seq INTEGER,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL,
  accuracy REAL NOT NULL,
  heading REAL,
  altitude REAL
);
CREATE INDEX IF NOT EXISTS points_trip ON points (client_id, seq, t);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  args TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS machine (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL,
  client_id TEXT,
  last_point TEXT
);
CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT
);
`)

// v1 adds trips.owner. Fresh installs run it too, on the empty table.
// v2 makes trips that v1 tagged "legacy" unclaimed: nothing proves which account recorded them, so the user confirms each one.
const version = db.getFirstSync<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0
if (version < 2) {
  db.withTransactionSync(() =>
    db.execSync(
      `${version < 1 ? "ALTER TABLE trips ADD COLUMN owner TEXT;" : ""} UPDATE trips SET owner = NULL WHERE owner = 'legacy'; PRAGMA user_version = 2;`,
    ),
  )
}

// Every local write goes through this one queue, in call order, so two writers never fight for the lock.
// Never await a network call inside it.
let queue: Promise<unknown> = Promise.resolve()
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch((e: unknown) => console.warn("local write failed", e))
  return run
}

/** One write transaction. Use it only inside serial(). It runs on its own connection, so it retries while SQLite is locked. */
export const transaction = (task: (tx: SQLiteDatabase) => Promise<void>) => retryBusy(() => db.withExclusiveTransactionAsync(task))

/** Queues one write transaction. */
export const write = (task: (tx: SQLiteDatabase) => Promise<void>) => serial(() => transaction(task))

export type LocalTrip = {
  client_id: string
  started_at: number
  ended_at: number | null
  start_source: StartSource
  stop_reason: StopReason | null
  vehicle_key: string | null
  next_seq: number
  /** Last retryable upload error, cleared on the next success. */
  last_error: string | null
  /** Set when the backend rejected a call for good. The trip then stays local until the user deletes it. */
  failed: string | null
  /** Clerk user ID, or null until the user claims the trip. Only the owner's session uploads the trip. */
  owner: string | null
}

export type PointRow = GpsPoint & { id: number }

const pointColumns = "id, t, lat, lng, speed, accuracy, heading, altitude"

/** Points of one trip in time order. Pass `unsent` to get only points not yet in a chunk. */
export const tripPoints = (clientId: string, unsent = false) =>
  db.getAllAsync<PointRow>(
    `SELECT ${pointColumns} FROM points WHERE client_id = ? ${unsent ? "AND seq IS NULL" : ""} ORDER BY t`,
    clientId,
  )

const accountUser = "(SELECT user_id FROM account WHERE id = 1)"

/** Local trips of the signed-in user and trips with no owner that still wait for upload, newest first, with the number of unsent calls. */
export const pendingTrips = () =>
  db.getAllAsync<LocalTrip & { pending: number; points: number }>(
    `SELECT trips.*,
       (SELECT COUNT(*) FROM outbox WHERE outbox.client_id = trips.client_id) AS pending,
       (SELECT COUNT(*) FROM points WHERE points.client_id = trips.client_id) AS points
     FROM trips WHERE owner IS NULL OR owner = ${accountUser} ORDER BY started_at DESC`,
  )

/** Unsent calls of the signed-in user's trips. */
export const outboxCount = async () =>
  (
    await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox JOIN trips USING (client_id) WHERE trips.owner = ${accountUser}`,
    )
  )?.n ?? 0
