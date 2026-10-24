import { haversineM, type GpsPoint } from "./geo"

/** Points with a worse accuracy radius than this are ignored for stats. */
export const MAX_ACCURACY_M = 50
/** Below this speed (about 3.6 km/h) the car counts as standing still. */
export const MOVING_SPEED_MPS = 1
/** Implied speeds above this (324 km/h) are GPS jumps, not driving. */
export const MAX_PLAUSIBLE_SPEED_MPS = 90

export type TripStats = {
  distanceM: number
  durationS: number
  /** Seconds spent above MOVING_SPEED_MPS. */
  movingS: number
  /** distanceM / movingS, so red lights do not pull the average down. */
  avgSpeedMps: number
  maxSpeedMps: number
}

/** Computes trip stats from time-sorted points. The phone uses it live. Convex uses it on finish, merge and trim. */
export function tripStats(points: readonly GpsPoint[]): TripStats {
  const good = points.filter((p) => p.accuracy <= MAX_ACCURACY_M)
  let distanceM = 0
  let movingS = 0
  let maxSpeedMps = 0
  let prev = good[0]
  for (let i = 1; i < good.length; i++) {
    const b = good[i]!
    const a = prev!
    const dt = (b.t - a.t) / 1000
    if (dt <= 0) continue
    const d = haversineM(a, b)
    const implied = d / dt
    // A jump point is dropped and the next segment is measured from the last good point.
    if (implied > MAX_PLAUSIBLE_SPEED_MPS) continue
    prev = b
    distanceM += d
    if (implied >= MOVING_SPEED_MPS) movingS += dt
    // Doppler speed is more exact than position deltas, so prefer it for the max.
    const speed = b.speed ?? (dt >= 1 ? implied : 0)
    if (speed <= MAX_PLAUSIBLE_SPEED_MPS) maxSpeedMps = Math.max(maxSpeedMps, speed)
  }
  const first = good[0]
  const last = good[good.length - 1]
  const durationS = first && last ? (last.t - first.t) / 1000 : 0
  return {
    distanceM,
    durationS,
    movingS,
    avgSpeedMps: movingS > 0 ? distanceM / movingS : 0,
    maxSpeedMps,
  }
}
