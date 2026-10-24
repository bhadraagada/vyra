import { ConvexError, v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { ownerId, ownVehicle } from "./lib"

const details = {
  make: v.optional(v.string()),
  model: v.optional(v.string()),
  year: v.optional(v.number()),
  registration: v.optional(v.string()),
  odometerBaselineKm: v.optional(v.number()),
}

const ownerVehicles = (ctx: QueryCtx, owner: string) =>
  ctx.db.query("vehicles").withIndex("by_owner", (q) => q.eq("ownerId", owner))

/** The vehicle whose triggerKey matches `key`, if it exists and is not archived. */
export async function vehicleByKey(ctx: QueryCtx, owner: string, key: string | null | undefined) {
  if (!key) return null
  const vehicle = await ctx.db
    .query("vehicles")
    .withIndex("by_owner_trigger", (q) => q.eq("ownerId", owner).eq("triggerKey", key.trim().toLowerCase()))
    .unique()
  return vehicle && !vehicle.archived ? vehicle._id : null
}

export async function defaultVehicle(ctx: QueryCtx, owner: string) {
  const all = await ownerVehicles(ctx, owner).collect()
  return all.find((x) => x.isDefault && !x.archived)?._id ?? null
}

/** Lowercases the key and checks the format and that no other vehicle of this owner uses it. */
async function checkTriggerKey(ctx: QueryCtx, owner: string, key: string, self?: Id<"vehicles">) {
  const clean = key.trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(clean)) throw new ConvexError("Trigger key can use only a-z, 0-9 and -")
  const taken = await ctx.db
    .query("vehicles")
    .withIndex("by_owner_trigger", (q) => q.eq("ownerId", owner).eq("triggerKey", clean))
    .unique()
  if (taken && taken._id !== self) throw new ConvexError(`Trigger key "${clean}" is already in use`)
  return clean
}

export const list = query({
  args: {},
  handler: async (ctx) => ownerVehicles(ctx, await ownerId(ctx)).collect(),
})

export const get = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    const owner = await ownerId(ctx)
    const vehicle = await ctx.db.get("vehicles", vehicleId)
    return vehicle?.ownerId === owner ? vehicle : null
  },
})

export const create = mutation({
  args: { name: v.string(), triggerKey: v.string(), ...details },
  handler: async (ctx, args) => {
    const owner = await ownerId(ctx)
    const triggerKey = await checkTriggerKey(ctx, owner, args.triggerKey)
    const isDefault = (await defaultVehicle(ctx, owner)) === null
    return ctx.db.insert("vehicles", { ...args, ownerId: owner, triggerKey, isDefault, archived: false })
  },
})

/** Changes only the fields that are sent. */
export const update = mutation({
  args: { vehicleId: v.id("vehicles"), name: v.optional(v.string()), triggerKey: v.optional(v.string()), ...details },
  handler: async (ctx, { vehicleId, ...fields }) => {
    const owner = await ownerId(ctx)
    await ownVehicle(ctx, owner, vehicleId)
    if (fields.triggerKey !== undefined) fields.triggerKey = await checkTriggerKey(ctx, owner, fields.triggerKey, vehicleId)
    await ctx.db.patch("vehicles", vehicleId, fields)
  },
})

export const setDefault = mutation({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    const owner = await ownerId(ctx)
    const vehicle = await ownVehicle(ctx, owner, vehicleId)
    if (vehicle.archived) throw new ConvexError("An archived vehicle cannot be the default")
    for (const other of await ownerVehicles(ctx, owner).collect()) {
      if (other.isDefault !== (other._id === vehicleId)) {
        await ctx.db.patch("vehicles", other._id, { isDefault: other._id === vehicleId })
      }
    }
  },
})

/** Hides the vehicle. Its trips keep the link. If it was the default, the newest active vehicle becomes the default. */
export const archive = mutation({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, { vehicleId }) => {
    const owner = await ownerId(ctx)
    const vehicle = await ownVehicle(ctx, owner, vehicleId)
    await ctx.db.patch("vehicles", vehicleId, { archived: true, isDefault: false })
    if (!vehicle.isDefault) return
    const next = (await ownerVehicles(ctx, owner).order("desc").collect()).find((x) => !x.archived)
    if (next) await ctx.db.patch("vehicles", next._id, { isDefault: true })
  },
})
