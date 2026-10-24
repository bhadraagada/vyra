import type { GpsPoint } from "./geo"
import { MAX_ACCURACY_M, MOVING_SPEED_MPS } from "./stats"

/**
 * Trip state machine. It is pure, so the phone runs it and tests replay recorded drives through it.
 *
 * The CANDIDATE state from the plan lives in the native motion module. That module fires a "motion"
 * start only after CoreMotion confirms automotive. SYNCED is upload state. The sync queue keeps it.
 */

export type StartSource = "manual" | "shortcut" | "motion"
export type StopReason = "manual" | "disconnect" | "walking" | "idle_timeout"
export type Activity = "automotive" | "walking" | "running" | "cycling" | "stationary" | "unknown"

/** Walking this long without a car connection ends the trip. */
export const WALKING_STOP_MS = 60_000
/** No movement this long without a car connection ends the trip. */
export const IDLE_STOP_MS = 15 * 60_000

export type TripState =
  | { kind: "idle" }
  | {
      kind: "recording"
      startedAt: number
      source: StartSource
      vehicleKey: string | null
      /** True after a CarPlay or Bluetooth Shortcut start. Standing still never ends a connected trip. */
      carConnected: boolean
      lastMovingAt: number
      walkingSince: number | null
    }
  | {
      kind: "completed"
      startedAt: number
      endedAt: number
      source: StartSource
      vehicleKey: string | null
      reason: StopReason
    }

export type TripEvent =
  | { type: "start"; at: number; source: StartSource; vehicleKey?: string | null }
  | { type: "stop"; at: number; reason: "manual" | "disconnect" }
  | { type: "location"; point: GpsPoint }
  | { type: "activity"; at: number; activity: Activity }
  | { type: "tick"; at: number }
  | { type: "reset" }

export const idle: TripState = { kind: "idle" }

export function nextState(state: TripState, event: TripEvent): TripState {
  if (event.type === "reset") return state.kind === "completed" ? idle : state

  if (state.kind === "idle") {
    if (event.type !== "start") return state
    return {
      kind: "recording",
      startedAt: event.at,
      source: event.source,
      vehicleKey: event.vehicleKey ?? null,
      carConnected: event.source === "shortcut",
      lastMovingAt: event.at,
      walkingSince: null,
    }
  }

  if (state.kind === "completed") return state

  switch (event.type) {
    case "start":
      // Motion and Shortcut can both fire for one drive. Keep one trip and take the car from the Shortcut.
      if (event.source !== "shortcut") return state
      return { ...state, carConnected: true, vehicleKey: event.vehicleKey ?? state.vehicleKey, walkingSince: null }
    case "stop":
      return complete(state, event.at, event.reason)
    case "location": {
      const p = event.point
      const moving = p.accuracy <= MAX_ACCURACY_M && (p.speed ?? 0) >= MOVING_SPEED_MPS
      return checkAutoStop(moving ? { ...state, lastMovingAt: Math.max(state.lastMovingAt, p.t) } : state, p.t)
    }
    case "activity": {
      const onFoot = event.activity === "walking" || event.activity === "running"
      const next: Recording = {
        ...state,
        walkingSince: onFoot ? (state.walkingSince ?? event.at) : null,
        lastMovingAt: event.activity === "automotive" ? Math.max(state.lastMovingAt, event.at) : state.lastMovingAt,
      }
      return checkAutoStop(next, event.at)
    }
    case "tick":
      return checkAutoStop(state, event.at)
  }
}

type Recording = Extract<TripState, { kind: "recording" }>

function checkAutoStop(state: Recording, now: number): TripState {
  if (state.carConnected) return state
  if (state.walkingSince !== null && now - state.walkingSince >= WALKING_STOP_MS) {
    return complete(state, state.lastMovingAt, "walking")
  }
  if (now - state.lastMovingAt >= IDLE_STOP_MS) return complete(state, state.lastMovingAt, "idle_timeout")
  return state
}

function complete(state: Recording, endedAt: number, reason: StopReason): TripState {
  return {
    kind: "completed",
    startedAt: state.startedAt,
    endedAt: Math.max(state.startedAt, endedAt),
    source: state.source,
    vehicleKey: state.vehicleKey,
    reason,
  }
}
