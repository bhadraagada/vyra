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

/** True when SQLite reports the database as locked (codes 5 and 6): another connection holds the write lock. */
export const isBusy = (e: unknown) => e instanceof Error && /Error code [56]\b|database (table )?is locked/.test(e.message)

/** Runs `fn`. While SQLite reports the database as locked, waits 50, 100, 200 ... ms and runs it again, `tries` times in all. */
export async function retryBusy<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= tries || !isBusy(e)) throw e
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** (attempt - 1)))
    }
  }
}
