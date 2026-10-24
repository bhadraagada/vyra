import { haversineM, type GpsPoint } from "@vyra/core"
import { ConvexError } from "convex/values"

/** Stores a point only if it moved at least 3 m or 10 s passed since the last stored point. */
export function shouldStore(last: GpsPoint | null, p: GpsPoint): boolean {
  return last === null || haversineM(last, p) >= 3 || p.t - last.t >= 10_000
}

/** Retry delay after `attempts` failed tries: 5 s, 10 s, 20 s ... up to 10 min. */
export const backoffMs = (attempts: number) => Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000)

/**
 * A ConvexError is a user-facing error from the backend, such as "Trip not found". Retrying it never helps,
 * so the outbox drops that call. "Not signed in" is the exception: it passes once a token is set.
 */
export const isPermanent = (e: unknown) => e instanceof ConvexError && e.data !== "Not signed in"
