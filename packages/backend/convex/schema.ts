import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * Every table has ownerId = identity.tokenIdentifier from Clerk.
 * Every query and mutation must filter by it. Users never see other users' data in v1.
 */

const nullableNumber = v.union(v.number(), v.null())

export const startSource = v.union(v.literal("manual"), v.literal("shortcut"), v.literal("motion"))
export const stopReason = v.union(
  v.literal("manual"),
  v.literal("disconnect"),
  v.literal("walking"),
  v.literal("idle_timeout"),
)

/** Column arrays, same shape as PointColumns in @vyra/core. */
export const pointColumns = {
  t: v.array(v.number()),
  lat: v.array(v.number()),
  lng: v.array(v.number()),
  speed: v.array(nullableNumber),
  accuracy: v.array(v.number()),
  heading: v.array(nullableNumber),
  altitude: v.array(nullableNumber),
}

export default defineSchema({
  vehicles: defineTable({
    ownerId: v.string(),
    name: v.string(),
    /** Value of ?vehicle= in vyra://start links, such as "swift". Unique per owner. */
    triggerKey: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    year: v.optional(v.number()),
    registration: v.optional(v.string()),
    odometerBaselineKm: v.optional(v.number()),
    isDefault: v.boolean(),
    archived: v.boolean(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_trigger", ["ownerId", "triggerKey"]),

  trips: defineTable({
    ownerId: v.string(),
    /** UUID made on the phone. Makes trip creation idempotent across retries. */
    clientId: v.string(),
    vehicleId: v.union(v.id("vehicles"), v.null()),
    status: v.union(v.literal("recording"), v.literal("completed")),
    startSource: startSource,
    stopReason: v.union(stopReason, v.null()),
    startedAt: v.number(),
    endedAt: v.union(v.number(), v.null()),
    /** Minutes east of UTC on the phone at trip start. Used for day keys. */
    tzOffsetMin: v.number(),
    distanceM: v.number(),
    durationS: v.number(),
    movingS: v.number(),
    avgSpeedMps: v.number(),
    maxSpeedMps: v.number(),
    /** Simplified [lat, lng] route for lists and map previews. */
    polyline: v.array(v.array(v.number())),
    /** gridCell of the first and last point, for frequent routes. Null until completed. */
    startCell: v.union(v.string(), v.null()),
    endCell: v.union(v.string(), v.null()),
    routeKey: v.union(v.string(), v.null()),
    pointCount: v.number(),
  })
    .index("by_owner_started", ["ownerId", "startedAt"])
    .index("by_owner_client", ["ownerId", "clientId"])
    .index("by_owner_route", ["ownerId", "routeKey"])
    .index("by_owner_vehicle_started", ["ownerId", "vehicleId", "startedAt"])
    .index("by_owner_status", ["ownerId", "status"])
    // For analytics.records: read the top trip instead of scanning every trip.
    .index("by_owner_distance", ["ownerId", "distanceM"])
    .index("by_owner_duration", ["ownerId", "durationS"])
    .index("by_owner_max_speed", ["ownerId", "maxSpeedMps"]),

  tripChunks: defineTable({
    ownerId: v.string(),
    tripId: v.id("trips"),
    /** 0-based chunk number from the phone. (tripId, seq) is unique, so a retried upload is a no-op. */
    seq: v.number(),
    ...pointColumns,
  }).index("by_trip_seq", ["tripId", "seq"]),

  /**
   * clientIds of trips the user deleted or merged into another trip.
   * start, appendChunk and finish ignore these, so a late phone retry does not bring a trip back or fail.
   */
  tripTombstones: defineTable({
    ownerId: v.string(),
    clientId: v.string(),
    kind: v.union(v.literal("deleted"), v.literal("merged")),
  }).index("by_owner_client", ["ownerId", "clientId"]),

  /** One row per owner and local day. Updated when a trip completes, is edited or is deleted. */
  dailyTotals: defineTable({
    ownerId: v.string(),
    day: v.string(),
    distanceM: v.number(),
    durationS: v.number(),
    tripCount: v.number(),
    maxSpeedMps: v.number(),
  }).index("by_owner_day", ["ownerId", "day"]),

  odometerEntries: defineTable({
    ownerId: v.string(),
    vehicleId: v.id("vehicles"),
    at: v.number(),
    km: v.number(),
    note: v.optional(v.string()),
  }).index("by_vehicle_at", ["vehicleId", "at"]),

  fuelEntries: defineTable({
    ownerId: v.string(),
    vehicleId: v.id("vehicles"),
    at: v.number(),
    odometerKm: v.number(),
    litres: v.number(),
    totalCost: v.number(),
    fullTank: v.boolean(),
    note: v.optional(v.string()),
  }).index("by_vehicle_at", ["vehicleId", "at"]),

  serviceEntries: defineTable({
    ownerId: v.string(),
    vehicleId: v.id("vehicles"),
    at: v.number(),
    kind: v.string(),
    cost: v.optional(v.number()),
    odometerKm: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index("by_vehicle_at", ["vehicleId", "at"]),
})
