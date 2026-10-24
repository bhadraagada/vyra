import { ConvexError, v } from "convex/values"
import { fuelSpans } from "@vyra/core"
import { mutation, query } from "./_generated/server"
import { ownerId, ownVehicle } from "./lib"

/*
 * Odometer, fuel and service logs per vehicle. Entries carry the ownerId of their vehicle,
 * so checking the vehicle owner is enough for list and add. Lists are newest first.
 */

const note = v.optional(v.string())

export const addOdometer = mutation({
  args: { vehicleId: v.id("vehicles"), at: v.number(), km: v.number(), note },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    await ownVehicle(ctx, owner, args.vehicleId)
    return ctx.db.insert("odometerEntries", { ...args, ownerId: owner })
  },
})

export const listOdometer = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    await ownVehicle(ctx, await ownerId(ctx), vehicleId)
    return ctx.db
      .query("odometerEntries")
      .withIndex("by_vehicle_at", (q) => q.eq("vehicleId", vehicleId))
      .order("desc")
      .collect()
  },
})

export const removeOdometer = mutation({
  args: { entryId: v.id("odometerEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get("odometerEntries", entryId)
    if (!entry || entry.ownerId !== (await ownerId(ctx))) throw new ConvexError("Entry not found")
    await ctx.db.delete("odometerEntries", entryId)
  },
})

export const addFuel = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    at: v.number(),
    odometerKm: v.number(),
    litres: v.number(),
    totalCost: v.number(),
    fullTank: v.boolean(),
    note,
  },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    await ownVehicle(ctx, owner, args.vehicleId)
    return ctx.db.insert("fuelEntries", { ...args, ownerId: owner })
  },
})

export const listFuel = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    await ownVehicle(ctx, await ownerId(ctx), vehicleId)
    return ctx.db
      .query("fuelEntries")
      .withIndex("by_vehicle_at", (q) => q.eq("vehicleId", vehicleId))
      .order("desc")
      .collect()
  },
})

export const removeFuel = mutation({
  args: { entryId: v.id("fuelEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get("fuelEntries", entryId)
    if (!entry || entry.ownerId !== (await ownerId(ctx))) throw new ConvexError("Entry not found")
    await ctx.db.delete("fuelEntries", entryId)
  },
})

export const addService = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    at: v.number(),
    kind: v.string(),
    cost: v.optional(v.number()),
    odometerKm: v.optional(v.number()),
    note,
  },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    await ownVehicle(ctx, owner, args.vehicleId)
    return ctx.db.insert("serviceEntries", { ...args, ownerId: owner })
  },
})

export const listService = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    await ownVehicle(ctx, await ownerId(ctx), vehicleId)
    return ctx.db
      .query("serviceEntries")
      .withIndex("by_vehicle_at", (q) => q.eq("vehicleId", vehicleId))
      .order("desc")
      .collect()
  },
})

export const removeService = mutation({
  args: { entryId: v.id("serviceEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get("serviceEntries", entryId)
    if (!entry || entry.ownerId !== (await ownerId(ctx))) throw new ConvexError("Entry not found")
    await ctx.db.delete("serviceEntries", entryId)
  },
})

/**
 * Trip totals, the newest odometer reading (from odometer or fuel entries) and fill-to-fill fuel economy.
 * avgKmPerL is total km over total litres of all spans, null without two full fills.
 */
export const vehicleSummary = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    const owner = await ownerId(ctx)
    await ownVehicle(ctx, owner, vehicleId)
    // shortcut: reads every trip of the vehicle. Fine for v1 volumes, keep running totals on the vehicle if it gets slow.
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_owner_vehicle_started", (q) => q.eq("ownerId", owner).eq("vehicleId", vehicleId))
      .collect()
    const completed = trips.filter((t) => t.status === "completed")
    const odometer = await ctx.db
      .query("odometerEntries")
      .withIndex("by_vehicle_at", (q) => q.eq("vehicleId", vehicleId))
      .order("desc")
      .first()
    const fuel = await ctx.db
      .query("fuelEntries")
      .withIndex("by_vehicle_at", (q) => q.eq("vehicleId", vehicleId))
      .collect()
    const lastFuel = fuel.at(-1)
    const readings = [
      odometer && { at: odometer.at, km: odometer.km },
      lastFuel && { at: lastFuel.at, km: lastFuel.odometerKm },
    ].filter((r) => r !== undefined && r !== null)
    const spans = fuelSpans(fuel)
    const spanKm = spans.reduce((sum, s) => sum + s.km, 0)
    const spanLitres = spans.reduce((sum, s) => sum + s.litres, 0)
    return {
      tripCount: completed.length,
      distanceM: completed.reduce((sum, t) => sum + t.distanceM, 0),
      durationS: completed.reduce((sum, t) => sum + t.durationS, 0),
      latestOdometer: readings.sort((a, b) => b.at - a.at)[0] ?? null,
      fuelSpans: spans,
      avgKmPerL: spanLitres > 0 ? spanKm / spanLitres : null,
    }
  },
})
