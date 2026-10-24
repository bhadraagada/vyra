import { ConvexError } from "convex/values"
import { dayKey, fromColumns, gridCell, routeKey, simplify, toColumns, tripStats, type GpsPoint } from "@vyra/core"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

const HOUR_MS = 3_600_000

/** The caller's ownerId (Clerk tokenIdentifier). Throws when the caller is not signed in. */
export async function ownerId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError("Not signed in")
  return identity.tokenIdentifier
}

/** Loads a trip of this owner. Throws when it is missing or belongs to someone else. */
export async function ownTrip(ctx: QueryCtx, owner: string, tripId: Id<"trips">): Promise<Doc<"trips">> {
  const trip = await ctx.db.get("trips", tripId)
  if (!trip || trip.ownerId !== owner) throw new ConvexError("Trip not found")
  return trip
}

/** Loads a vehicle of this owner. Throws when it is missing or belongs to someone else. */
export async function ownVehicle(ctx: QueryCtx, owner: string, vehicleId: Id<"vehicles">): Promise<Doc<"vehicles">> {
  const vehicle = await ctx.db.get("vehicles", vehicleId)
  if (!vehicle || vehicle.ownerId !== owner) throw new ConvexError("Vehicle not found")
  return vehicle
}

export const tripChunks = (ctx: QueryCtx, tripId: Id<"trips">) =>
  ctx.db.query("tripChunks").withIndex("by_trip_seq", (q) => q.eq("tripId", tripId))

type TripPatch = Partial<Omit<Doc<"trips">, "_id" | "_creationTime" | "ownerId" | "clientId">>

/**
 * Applies `patch` to a trip and rebuilds its stats, polyline, cells and routeKey from the chunks.
 * Every chunk upload, finish and edit goes through here.
 * A completed trip keeps only points in [startedAt, endedAt]. Chunks with points outside are rewritten or deleted.
 * Then dailyTotals is rebuilt for the old and the new day of the trip.
 */
export async function recompute(ctx: MutationCtx, trip: Doc<"trips">, patch: TripPatch = {}): Promise<void> {
  const next = { ...trip, ...patch }
  const { startedAt, endedAt } = next
  const points: GpsPoint[] = []
  for (const chunk of await tripChunks(ctx, trip._id).collect()) {
    const all = fromColumns(chunk)
    const kept = endedAt === null ? all : all.filter((p) => p.t >= startedAt && p.t <= endedAt)
    if (kept.length === 0) await ctx.db.delete("tripChunks", chunk._id)
    else if (kept.length < all.length) await ctx.db.patch("tripChunks", chunk._id, toColumns(kept))
    points.push(...kept)
  }
  // Merged trips can have chunks out of time order.
  points.sort((a, b) => a.t - b.t)
  const first = points[0]
  const last = points.at(-1)
  const completed = next.status === "completed"
  const startCell = completed && first ? gridCell(first) : null
  const endCell = completed && last ? gridCell(last) : null
  await ctx.db.patch("trips", trip._id, {
    ...patch,
    ...tripStats(points),
    polyline: simplify(points),
    pointCount: points.length,
    startCell,
    endCell,
    routeKey: startCell && endCell ? routeKey(startCell, endCell) : null,
  })
  await refreshDays(ctx, trip.ownerId, [trip, next])
}

/**
 * Rebuilds dailyTotals for the local days of these trips from the completed trips of each day.
 * The max speed of a day cannot be decremented, so the day's trips are read anyway.
 * Summing them in the same pass gives the exact "remove old, add new" result and cannot drift.
 */
export async function refreshDays(
  ctx: MutationCtx,
  owner: string,
  trips: readonly Pick<Doc<"trips">, "startedAt" | "tzOffsetMin">[],
): Promise<void> {
  const days = new Set(trips.map((t) => dayKey(t.startedAt, t.tzOffsetMin)))
  for (const day of days) {
    const dayStart = Date.parse(`${day}T00:00:00Z`)
    // Offsets run from -12 h to +14 h, so every trip of this local day starts inside this UTC window.
    const candidates = await ctx.db
      .query("trips")
      .withIndex("by_owner_started", (q) =>
        q.eq("ownerId", owner).gte("startedAt", dayStart - 14 * HOUR_MS).lt("startedAt", dayStart + 36 * HOUR_MS),
      )
      .collect()
    const dayTrips = candidates.filter((t) => t.status === "completed" && dayKey(t.startedAt, t.tzOffsetMin) === day)
    const row = await ctx.db
      .query("dailyTotals")
      .withIndex("by_owner_day", (q) => q.eq("ownerId", owner).eq("day", day))
      .unique()
    if (dayTrips.length === 0) {
      if (row) await ctx.db.delete("dailyTotals", row._id)
      continue
    }
    const totals = {
      distanceM: dayTrips.reduce((sum, t) => sum + t.distanceM, 0),
      durationS: dayTrips.reduce((sum, t) => sum + t.durationS, 0),
      tripCount: dayTrips.length,
      maxSpeedMps: Math.max(...dayTrips.map((t) => t.maxSpeedMps)),
    }
    if (row) await ctx.db.patch("dailyTotals", row._id, totals)
    else await ctx.db.insert("dailyTotals", { ownerId: owner, day, ...totals })
  }
}
