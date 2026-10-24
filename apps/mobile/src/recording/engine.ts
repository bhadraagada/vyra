import {
  CHUNK_SIZE,
  idle,
  localTzOffsetMin,
  nextState,
  toColumns,
  tripStats,
  type Activity,
  type GpsPoint,
  type StartSource,
  type TripEvent,
  type TripState,
} from "@vyra/core"
import * as Crypto from "expo-crypto"
import * as Location from "expo-location"
import type { SQLiteDatabase } from "expo-sqlite"
import * as motion from "../../modules/vyra-motion"
import { db, serial, transaction, tripPoints, type LocalTrip, type PointRow } from "./db"
import { notify } from "./events"
import { enqueue, flush } from "./outbox"
import { shouldStore } from "./rules"

export const LOCATION_TASK = "vyra-location"

type Machine = { state: TripState; clientId: string | null; lastPoint: GpsPoint | null }
type MachineRow = { state: string; client_id: string | null; last_point: string | null }

let cached: Machine | null = null

async function machine(): Promise<Machine> {
  if (cached) return cached
  const row = await db.getFirstAsync<MachineRow>("SELECT state, client_id, last_point FROM machine WHERE id = 1")
  cached = row
    ? {
        state: JSON.parse(row.state) as TripState,
        clientId: row.client_id,
        lastPoint: row.last_point ? (JSON.parse(row.last_point) as GpsPoint) : null,
      }
    : { state: idle, clientId: null, lastPoint: null }
  return cached
}

// Location updates, motion events and taps can arrive together. Each event runs alone, in arrival order,
// in the same queue as every other local write.
export const dispatch = (event: TripEvent) => serial(() => step(event))

/**
 * Runs one event through the trip machine from @vyra/core and writes the result to SQLite in one transaction:
 * the new local trip and its `start` call, the stored point, full chunks, and on completion the last chunk and `finish`.
 * A new trip starts GPS first. If GPS fails to start, this throws and saves nothing.
 */
async function step(event: TripEvent) {
  const prev = await machine()
  const first = nextState(prev.state, event)
  const starting = prev.state.kind === "idle" && first.kind === "recording"
  let state = first
  let { clientId, lastPoint } = prev
  let upload = false

  if (starting) await setTracking(true)
  try {
    await transaction(async (tx) => {
      // A locked database runs this again, so start from the saved machine each time.
      state = first
      ;({ clientId, lastPoint } = prev)
      upload = false
      if (starting && state.kind === "recording") {
        clientId = Crypto.randomUUID()
        lastPoint = null
        // The owner is the user signed in now. setAccount() keeps that user in the account table.
        await tx.runAsync(
          "INSERT INTO trips (client_id, started_at, start_source, vehicle_key, owner) VALUES (?, ?, ?, ?, (SELECT user_id FROM account WHERE id = 1))",
          clientId,
          state.startedAt,
          state.source,
          state.vehicleKey,
        )
        await enqueue(tx, {
          kind: "start",
          args: {
            clientId,
            startSource: state.source,
            startedAt: state.startedAt,
            tzOffsetMin: localTzOffsetMin(new Date(state.startedAt)),
            vehicleKey: state.vehicleKey,
          },
        })
        upload = true
      }
      if (!clientId) return

      if (state.kind === "recording" && prev.state.kind === "recording" && state.vehicleKey !== prev.state.vehicleKey) {
        await tx.runAsync("UPDATE trips SET vehicle_key = ? WHERE client_id = ?", state.vehicleKey, clientId)
      }

      if (prev.state.kind === "recording" && event.type === "location" && shouldStore(lastPoint, event.point)) {
        const p = event.point
        await tx.runAsync(
          "INSERT INTO points (client_id, t, lat, lng, speed, accuracy, heading, altitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          clientId,
          p.t,
          p.lat,
          p.lng,
          p.speed,
          p.accuracy,
          p.heading,
          p.altitude,
        )
        lastPoint = p
        upload = (await cutChunks(tx, clientId, false)) || upload
      }

      if (state.kind === "completed") {
        await tx.runAsync(
          "UPDATE trips SET ended_at = ?, stop_reason = ?, vehicle_key = ? WHERE client_id = ?",
          state.endedAt,
          state.reason,
          state.vehicleKey,
          clientId,
        )
        await cutChunks(tx, clientId, true)
        // The server drops points after endedAt, so the phone sends all of them.
        await enqueue(tx, {
          kind: "finish",
          args: { clientId, endedAt: state.endedAt, stopReason: state.reason, vehicleKey: state.vehicleKey },
        })
        state = nextState(state, { type: "reset" })
        clientId = null
        lastPoint = null
        upload = true
      }

      await tx.runAsync(
        "INSERT OR REPLACE INTO machine (id, state, client_id, last_point) VALUES (1, ?, ?, ?)",
        JSON.stringify(state),
        clientId,
        lastPoint && JSON.stringify(lastPoint),
      )
    })
  } catch (e) {
    if (starting) await setTracking(false).catch((err: unknown) => console.warn("location updates failed", err))
    throw e
  }

  cached = { state, clientId, lastPoint }
  notify()
  if (upload) void flush()
  if (!starting && prev.state.kind !== state.kind) {
    // The stop is saved either way. A failure here leaves GPS on until the next relaunch.
    await setTracking(state.kind === "recording").catch((e: unknown) => console.warn("location updates failed", e))
  }
}

/** Moves unsent points into outbox chunks of CHUNK_SIZE. With `all`, the last partial chunk goes too. */
async function cutChunks(tx: SQLiteDatabase, clientId: string, all: boolean): Promise<boolean> {
  let cut = false
  for (;;) {
    const points = await tx.getAllAsync<PointRow>(
      `SELECT id, t, lat, lng, speed, accuracy, heading, altitude FROM points
       WHERE client_id = ? AND seq IS NULL ORDER BY t LIMIT ${CHUNK_SIZE}`,
      clientId,
    )
    if (points.length === 0 || (!all && points.length < CHUNK_SIZE)) return cut
    const trip = await tx.getFirstAsync<Pick<LocalTrip, "next_seq">>("SELECT next_seq FROM trips WHERE client_id = ?", clientId)
    const seq = trip?.next_seq ?? 0
    await tx.runAsync(`UPDATE points SET seq = ? WHERE id IN (${points.map((p) => p.id).join(",")})`, seq)
    await tx.runAsync("UPDATE trips SET next_seq = ? WHERE client_id = ?", seq + 1, clientId)
    await enqueue(tx, { kind: "chunk", args: { clientId, seq, ...toColumns(points) } })
    cut = true
  }
}

/** Starts or stops GPS and motion activity updates to match the machine. */
async function setTracking(on: boolean) {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
  if (on && !started) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      distanceInterval: 0,
    })
  }
  if (!on && started) await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  if (on) motion.startActivityUpdates()
  else motion.stopActivityUpdates()
}

/**
 * Starts a trip, or joins the one that records. Returns null on success, else a message for the user.
 * No trip is saved when location access is missing or GPS fails to start.
 * Motion starts happen in the background, where GPS needs "Always" access.
 */
export async function startTrip(source: StartSource, vehicleKey: string | null = null, at = Date.now()): Promise<string | null> {
  const access = source === "motion" ? Location.getBackgroundPermissionsAsync() : Location.getForegroundPermissionsAsync()
  if (!(await access).granted) return source === "motion" ? "Location access is not set to Always." : "Location access is off."
  try {
    await dispatch({ type: "start", at, source, vehicleKey })
    return null
  } catch (e) {
    return `Could not start the trip. ${e instanceof Error ? e.message : String(e)}`
  }
}

export const stopTrip = (reason: "manual" | "disconnect") => dispatch({ type: "stop", at: Date.now(), reason })

export async function onLocations(points: GpsPoint[]) {
  // serial() logs a failed point. The rest of the batch still runs.
  for (const point of points) await dispatch({ type: "location", point }).catch(() => undefined)
  // Cheap when the queue is empty. This is how retries run while the app is in the background.
  void flush()
}

export const onActivity = (activity: Activity, at: number) => dispatch({ type: "activity", at, activity })

/** After a relaunch, makes GPS match the saved machine state. */
export const resumeTracking = () => serial(async () => setTracking((await machine()).state.kind === "recording"))

export type LiveSnapshot = {
  state: TripState
  trip: LocalTrip | null
  stats: ReturnType<typeof tripStats>
  speedMps: number | null
}

/** Live view of the current trip for the Record screen. */
export async function liveSnapshot(): Promise<LiveSnapshot> {
  const { state, clientId } = await machine()
  // shortcut: reads all points of the trip on every update, fine for drives of a few hours. Keep running totals if it lags.
  const points = clientId ? await tripPoints(clientId) : []
  const trip = clientId ? await db.getFirstAsync<LocalTrip>("SELECT * FROM trips WHERE client_id = ?", clientId) : null
  return { state, trip, stats: tripStats(points), speedMps: points.at(-1)?.speed ?? null }
}
