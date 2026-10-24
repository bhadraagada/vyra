import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"
import { fromColumns } from "@vyra/core"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { ownerId, ownTrip, ownVehicle, recompute, refreshDays, tripChunks } from "./lib"
import { pointColumns, startSource, stopReason } from "./schema"
import { defaultVehicle, vehicleByKey } from "./vehicles"

const vehicleKey = v.optional(v.union(v.string(), v.null()))

const tripByClient = (ctx: QueryCtx, owner: string, clientId: string) =>
  ctx.db
    .query("trips")
    .withIndex("by_owner_client", (q) => q.eq("ownerId", owner).eq("clientId", clientId))
    .unique()

const isTombstoned = async (ctx: QueryCtx, owner: string, clientId: string) =>
  (await ctx.db
    .query("tripTombstones")
    .withIndex("by_owner_client", (q) => q.eq("ownerId", owner).eq("clientId", clientId))
    .first()) !== null

/** The trip for a phone call, or null when the user deleted or merged it. Throws when the clientId was never used. */
async function tripForPhone(ctx: QueryCtx, owner: string, clientId: string) {
  const trip = await tripByClient(ctx, owner, clientId)
  if (trip) return trip
  if (await isTombstoned(ctx, owner, clientId)) return null
  throw new ConvexError("Trip not found")
}

/**
 * Creates the trip, or returns the existing one for a retried clientId.
 * Returns null for the clientId of a deleted or merged trip, so a late retry does not create it again.
 */
export const start = mutation({
  args: { clientId: v.string(), startSource, startedAt: v.number(), tzOffsetMin: v.number(), vehicleKey },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    const existing = await tripByClient(ctx, owner, args.clientId)
    if (existing) return existing._id
    if (await isTombstoned(ctx, owner, args.clientId)) return null
    const vehicleId = (await vehicleByKey(ctx, owner, args.vehicleKey)) ?? (await defaultVehicle(ctx, owner))
    return ctx.db.insert("trips", {
      ownerId: owner,
      clientId: args.clientId,
      vehicleId,
      status: "recording",
      startSource: args.startSource,
      stopReason: null,
      startedAt: args.startedAt,
      endedAt: null,
      tzOffsetMin: args.tzOffsetMin,
      distanceM: 0,
      durationS: 0,
      movingS: 0,
      avgSpeedMps: 0,
      maxSpeedMps: 0,
      polyline: [],
      startCell: null,
      endCell: null,
      routeKey: null,
      pointCount: 0,
    })
  },
})

/**
 * Stores one chunk. A retried (clientId, seq) is a no-op. A late chunk after finish recomputes the trip.
 * A chunk for a deleted or merged trip is a no-op.
 */
export const appendChunk = mutation({
  args: { clientId: v.string(), seq: v.number(), ...pointColumns },
  handler: async (ctx, { clientId, ...chunk }) => {
    const owner = await ownerId(ctx)
    const trip = await tripForPhone(ctx, owner, clientId)
    if (!trip) return null
    const columns = [chunk.lat, chunk.lng, chunk.speed, chunk.accuracy, chunk.heading, chunk.altitude]
    if (!Number.isInteger(chunk.seq) || chunk.seq < 0) throw new ConvexError("seq must be a whole number from 0")
    if (columns.some((c) => c.length !== chunk.t.length)) throw new ConvexError("All point columns must have the same length")
    const existing = await ctx.db
      .query("tripChunks")
      .withIndex("by_trip_seq", (q) => q.eq("tripId", trip._id).eq("seq", chunk.seq))
      .unique()
    if (existing) return null
    await ctx.db.insert("tripChunks", { ownerId: owner, tripId: trip._id, ...chunk })
    await recompute(ctx, trip)
    return null
  },
})

/**
 * Completes the trip. The phone sends finish once per trip, so a call on a completed, deleted or merged trip
 * is a retry. It changes nothing, so it cannot undo a later merge, trim or vehicle edit.
 */
export const finish = mutation({
  args: { clientId: v.string(), endedAt: v.number(), stopReason, vehicleKey },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    const trip = await tripForPhone(ctx, owner, args.clientId)
    if (!trip || trip.status === "completed") return null
    if (args.endedAt < trip.startedAt) throw new ConvexError("endedAt is before startedAt")
    const vehicleId = (await vehicleByKey(ctx, owner, args.vehicleKey)) ?? trip.vehicleId
    await recompute(ctx, trip, { status: "completed", endedAt: args.endedAt, stopReason: args.stopReason, vehicleId })
    return null
  },
})

/** Trips newest first. Pass vehicleId to show one vehicle. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator, vehicleId: v.optional(v.id("vehicles")) },
  handler: async (ctx, { paginationOpts, vehicleId }) => {
    const owner = await ownerId(ctx)
    if (vehicleId) {
      return ctx.db
        .query("trips")
        .withIndex("by_owner_vehicle_started", (q) => q.eq("ownerId", owner).eq("vehicleId", vehicleId))
        .order("desc")
        .paginate(paginationOpts)
    }
    return ctx.db
      .query("trips")
      .withIndex("by_owner_started", (q) => q.eq("ownerId", owner))
      .order("desc")
      .paginate(paginationOpts)
  },
})

export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const owner = await ownerId(ctx)
    const trip = await ctx.db.get("trips", tripId)
    return trip?.ownerId === owner ? trip : null
  },
})

/** All points of the trip as GpsPoint objects, sorted by time. */
export const points = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    await ownTrip(ctx, await ownerId(ctx), tripId)
    const chunks = await tripChunks(ctx, tripId).collect()
    return chunks.flatMap(fromColumns).sort((a, b) => a.t - b.t)
  },
})

/** The trip that is recording now, or null. */
export const live = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerId(ctx)
    return ctx.db
      .query("trips")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", owner).eq("status", "recording"))
      .order("desc")
      .first()
  },
})

export const remove = mutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, { tripId }) => {
    const owner = await ownerId(ctx)
    const trip = await ownTrip(ctx, owner, tripId)
    for (const chunk of await tripChunks(ctx, tripId).collect()) await ctx.db.delete("tripChunks", chunk._id)
    await ctx.db.delete("trips", tripId)
    await ctx.db.insert("tripTombstones", { ownerId: owner, clientId: trip.clientId, kind: "deleted" })
    await refreshDays(ctx, owner, [trip])
  },
})

export const setVehicle = mutation({
  args: { tripId: v.id("trips"), vehicleId: v.union(v.id("vehicles"), v.null()) },
  handler: async (ctx, { tripId, vehicleId }) => {
    const owner = await ownerId(ctx)
    const trip = await ownTrip(ctx, owner, tripId)
    if (vehicleId) await ownVehicle(ctx, owner, vehicleId)
    await recompute(ctx, trip, { vehicleId })
  },
})

/**
 * Joins two completed trips into the first one. The chunks of the second move over and the second is deleted.
 * The clientId of the second gets a tombstone, so phone retries for it are ignored.
 */
export const merge = mutation({
  args: { firstId: v.id("trips"), secondId: v.id("trips") },
  handler: async (ctx, { firstId, secondId }) => {
    const owner = await ownerId(ctx)
    if (firstId === secondId) throw new ConvexError("Cannot merge a trip with itself")
    const first = await ownTrip(ctx, owner, firstId)
    const second = await ownTrip(ctx, owner, secondId)
    if (first.status !== "completed" || second.status !== "completed") {
      throw new ConvexError("Only completed trips can be merged")
    }
    const lastSeq = (await tripChunks(ctx, firstId).order("desc").first())?.seq ?? -1
    for (const chunk of await tripChunks(ctx, secondId).collect()) {
      await ctx.db.patch("tripChunks", chunk._id, { tripId: firstId, seq: chunk.seq + lastSeq + 1 })
    }
    await ctx.db.delete("trips", secondId)
    await ctx.db.insert("tripTombstones", { ownerId: owner, clientId: second.clientId, kind: "merged" })
    const later = (second.endedAt ?? 0) > (first.endedAt ?? 0) ? second : first
    await recompute(ctx, first, {
      startedAt: Math.min(first.startedAt, second.startedAt),
      endedAt: later.endedAt,
      stopReason: later.stopReason,
      vehicleId: first.vehicleId ?? second.vehicleId,
    })
    await refreshDays(ctx, owner, [second])
  },
})

/** Keeps only the points in [startAt, endAt] and moves the trip start and end to match. */
export const trim = mutation({
  args: { tripId: v.id("trips"), startAt: v.number(), endAt: v.number() },
  handler: async (ctx, { tripId, startAt, endAt }) => {
    const owner = await ownerId(ctx)
    const trip = await ownTrip(ctx, owner, tripId)
    if (trip.status !== "completed" || trip.endedAt === null) throw new ConvexError("Only completed trips can be trimmed")
    const startedAt = Math.max(trip.startedAt, startAt)
    const endedAt = Math.min(trip.endedAt, endAt)
    if (startedAt >= endedAt) throw new ConvexError("Trim range is empty")
    await recompute(ctx, trip, { startedAt, endedAt })
  },
})
