import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { query, type QueryCtx } from "./_generated/server"
import { ownerId } from "./lib"

/** dailyTotals rows for local days "YYYY-MM-DD" from fromDay to toDay, both included. */
export const daily = query({
  args: { fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, { fromDay, toDay }) => {
    const owner = await ownerId(ctx)
    return ctx.db
      .query("dailyTotals")
      .withIndex("by_owner_day", (q) => q.eq("ownerId", owner).gte("day", fromDay).lte("day", toDay))
      .collect()
  },
})

type RecordIndex = "by_owner_distance" | "by_owner_duration" | "by_owner_max_speed"

/** The completed trip with the highest value in this index. Recording trips have live stats, so skip them. */
const topTrip = (ctx: QueryCtx, owner: string, index: RecordIndex) =>
  ctx.db
    .query("trips")
    .withIndex(index, (q) => q.eq("ownerId", owner))
    .order("desc")
    .filter((q) => q.eq(q.field("status"), "completed"))
    .first()

export const records = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerId(ctx)
    const days = await ctx.db
      .query("dailyTotals")
      .withIndex("by_owner_day", (q) => q.eq("ownerId", owner))
      .collect()
    return {
      longestDistance: await topTrip(ctx, owner, "by_owner_distance"),
      longestDuration: await topTrip(ctx, owner, "by_owner_duration"),
      topSpeed: await topTrip(ctx, owner, "by_owner_max_speed"),
      biggestDay: days.reduce<Doc<"dailyTotals"> | null>((best, d) => (best && best.distanceM >= d.distanceM ? best : d), null),
    }
  },
})

/** Start and end cell pairs driven 2 or more times, most recently driven first. */
export const frequentRoutes = query({
  args: {},
  handler: async (ctx) => {
    const owner = await ownerId(ctx)
    // shortcut: reads every completed trip of the owner. Fine for a few thousand trips, keep a routes table if it gets slow.
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", owner).eq("status", "completed"))
      .collect()
    trips.sort((a, b) => b.startedAt - a.startedAt)
    const groups = new Map<string, { routeKey: string; count: number; distanceM: number; lastAt: number; polyline: number[][] }>()
    for (const trip of trips) {
      if (!trip.routeKey) continue
      const group = groups.get(trip.routeKey)
      if (group) {
        group.count++
        group.distanceM += trip.distanceM
      } else {
        groups.set(trip.routeKey, {
          routeKey: trip.routeKey,
          count: 1,
          distanceM: trip.distanceM,
          lastAt: trip.startedAt,
          polyline: trip.polyline,
        })
      }
    }
    // Map keeps insertion order, and trips are newest first, so groups are too.
    return [...groups.values()].filter((g) => g.count >= 2)
  },
})
