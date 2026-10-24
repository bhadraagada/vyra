/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { toColumns, type GpsPoint } from "@vyra/core"
import { api } from "./_generated/api"
import schema from "./schema"

// Function modules plus _generated, without type files and tests.
const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.d.ts", "!./**/*.test.ts"])

const T0 = Date.UTC(2026, 9, 24, 8, 0, 0)
const TZ = 330

/** `count` points 1 s apart, driving north at `speed` m/s from `lat`. */
const drive = (from: number, count: number, lat = 19, speed = 10): GpsPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    t: from + i * 1000,
    lat: lat + (i * speed) / 111_320,
    lng: 72.8,
    speed,
    accuracy: 5,
    heading: null,
    altitude: null,
  }))

function setup() {
  const t = convexTest(schema, modules)
  return { t, alice: t.withIdentity({ subject: "alice" }), bob: t.withIdentity({ subject: "bob" }) }
}

type User = ReturnType<typeof setup>["alice"]

/** Starts a trip, uploads `chunks` in order and finishes it. Returns the trip id. */
async function recordTrip(user: User, clientId: string, chunks: GpsPoint[][], endedAt: number) {
  const tripId = await user.mutation(api.trips.start, {
    clientId,
    startSource: "manual",
    startedAt: chunks[0]![0]!.t,
    tzOffsetMin: TZ,
  })
  for (const [seq, points] of chunks.entries()) {
    await user.mutation(api.trips.appendChunk, { clientId, seq, ...toColumns(points) })
  }
  await user.mutation(api.trips.finish, { clientId, endedAt, stopReason: "manual" })
  return tripId
}

const page = { paginationOpts: { numItems: 10, cursor: null } }
const today = (user: User) => user.query(api.analytics.daily, { fromDay: "2026-10-24", toDay: "2026-10-24" })

describe("trips", () => {
  it("start is idempotent per clientId", async () => {
    const { alice } = setup()
    const args = { clientId: "c1", startSource: "manual" as const, startedAt: T0, tzOffsetMin: TZ }
    const first = await alice.mutation(api.trips.start, args)
    expect(await alice.mutation(api.trips.start, args)).toBe(first)
    expect((await alice.query(api.trips.list, page)).page).toHaveLength(1)
  })

  it("a retried chunk is a no-op", async () => {
    const { alice } = setup()
    const tripId = await alice.mutation(api.trips.start, {
      clientId: "c1",
      startSource: "motion",
      startedAt: T0,
      tzOffsetMin: TZ,
    })
    await alice.mutation(api.trips.appendChunk, { clientId: "c1", seq: 0, ...toColumns(drive(T0, 50)) })
    await alice.mutation(api.trips.appendChunk, { clientId: "c1", seq: 0, ...toColumns(drive(T0, 80)) })
    const trip = (await alice.query(api.trips.get, { tripId }))!
    expect(trip).toMatchObject({ status: "recording", pointCount: 50 })
    expect(trip.polyline.length).toBeGreaterThanOrEqual(2)
    expect(await alice.query(api.trips.live, {})).toMatchObject({ _id: tripId })
  })

  it("finish computes stats, cells and dailyTotals, and a repeat finish is a no-op", async () => {
    const { alice } = setup()
    const tripId = await recordTrip(alice, "c1", [drive(T0, 101)], T0 + 100_000)
    const trip = (await alice.query(api.trips.get, { tripId }))!
    expect(trip).toMatchObject({ status: "completed", pointCount: 101, durationS: 100, maxSpeedMps: 10 })
    expect(trip.distanceM).toBeCloseTo(1000, -1)
    expect(trip.routeKey).toBe(`${trip.startCell}>${trip.endCell}`)
    expect(await today(alice)).toMatchObject([{ tripCount: 1, distanceM: trip.distanceM, durationS: 100, maxSpeedMps: 10 }])

    await alice.mutation(api.trips.finish, { clientId: "c1", endedAt: T0 + 100_000, stopReason: "manual" })
    expect(await alice.query(api.trips.get, { tripId })).toEqual(trip)
    expect(await alice.query(api.trips.live, {})).toBeNull()
  })

  it("finish drops points after endedAt", async () => {
    const { alice } = setup()
    const tripId = await recordTrip(alice, "c1", [drive(T0, 100)], T0 + 49_000)
    expect(await alice.query(api.trips.get, { tripId })).toMatchObject({ pointCount: 50 })
    expect(await alice.query(api.trips.points, { tripId })).toHaveLength(50)
  })

  it("a late chunk after finish recomputes the trip and dailyTotals", async () => {
    const { alice } = setup()
    const points = drive(T0, 200)
    const tripId = await recordTrip(alice, "c1", [points.slice(0, 100)], T0 + 199_000)
    const before = (await alice.query(api.trips.get, { tripId }))!
    await alice.mutation(api.trips.appendChunk, { clientId: "c1", seq: 1, ...toColumns(points.slice(100)) })
    const after = (await alice.query(api.trips.get, { tripId }))!
    expect(after.pointCount).toBe(200)
    expect(after.distanceM).toBeGreaterThan(before.distanceM * 1.9)
    expect(await today(alice)).toMatchObject([{ tripCount: 1, distanceM: after.distanceM }])
  })

  it("merge moves the chunks into the first trip and fixes dailyTotals", async () => {
    const { t, alice } = setup()
    const firstId = await recordTrip(alice, "c1", [drive(T0, 60)], T0 + 59_000)
    const secondId = await recordTrip(alice, "c2", [drive(T0 + 120_000, 60, 19.01)], T0 + 179_000)
    await alice.mutation(api.trips.merge, { firstId, secondId })

    expect(await alice.query(api.trips.get, { tripId: secondId })).toBeNull()
    const merged = (await alice.query(api.trips.get, { tripId: firstId }))!
    expect(merged).toMatchObject({ pointCount: 120, startedAt: T0, endedAt: T0 + 179_000 })
    const chunks = await t.run(async (ctx) => (await ctx.db.query("tripChunks").collect()).map((c) => [c.tripId, c.seq]))
    expect(chunks).toEqual([
      [firstId, 0],
      [firstId, 1],
    ])
    expect(await today(alice)).toMatchObject([{ tripCount: 1, distanceM: merged.distanceM }])
  })

  it("trim keeps only points in range and rewrites the chunk", async () => {
    const { alice } = setup()
    const tripId = await recordTrip(alice, "c1", [drive(T0, 100)], T0 + 99_000)
    await alice.mutation(api.trips.trim, { tripId, startAt: T0 + 20_000, endAt: T0 + 39_000 })
    const trip = (await alice.query(api.trips.get, { tripId }))!
    expect(trip).toMatchObject({ pointCount: 20, startedAt: T0 + 20_000, endedAt: T0 + 39_000, durationS: 19 })
    expect((await alice.query(api.trips.points, { tripId }))[0]!.t).toBe(T0 + 20_000)
    expect(await today(alice)).toMatchObject([{ distanceM: trip.distanceM, durationS: 19 }])
  })

  it("remove fixes dailyTotals, including the max speed", async () => {
    const { alice } = setup()
    await recordTrip(alice, "slow", [drive(T0, 30, 19, 10)], T0 + 29_000)
    const fastId = await recordTrip(alice, "fast", [drive(T0 + 600_000, 30, 19, 30)], T0 + 629_000)
    expect(await today(alice)).toMatchObject([{ tripCount: 2, maxSpeedMps: 30 }])

    await alice.mutation(api.trips.remove, { tripId: fastId })
    expect(await today(alice)).toMatchObject([{ tripCount: 1, maxSpeedMps: 10, durationS: 29 }])
  })

  it("isolates owners and rejects anonymous calls", async () => {
    const { t, alice, bob } = setup()
    const tripId = await recordTrip(alice, "c1", [drive(T0, 30)], T0 + 29_000)

    expect(await bob.query(api.trips.get, { tripId })).toBeNull()
    expect((await bob.query(api.trips.list, page)).page).toEqual([])
    expect(await today(bob)).toEqual([])
    await expect(bob.query(api.trips.points, { tripId })).rejects.toThrow("Trip not found")
    await expect(bob.mutation(api.trips.remove, { tripId })).rejects.toThrow("Trip not found")
    await expect(
      bob.mutation(api.trips.appendChunk, { clientId: "c1", seq: 1, ...toColumns(drive(T0, 5)) }),
    ).rejects.toThrow("Trip not found")
    await expect(t.query(api.trips.list, page)).rejects.toThrow("Not signed in")
    expect(await alice.query(api.trips.get, { tripId })).toMatchObject({ pointCount: 30 })
  })
})

describe("vehicles and analytics", () => {
  it("resolves the vehicle key, groups frequent routes and finds records", async () => {
    const { alice } = setup()
    const swift = await alice.mutation(api.vehicles.create, { name: "Swift", triggerKey: "Swift" })
    const city = await alice.mutation(api.vehicles.create, { name: "City", triggerKey: "city" })
    expect(await alice.query(api.vehicles.get, { vehicleId: swift })).toMatchObject({ triggerKey: "swift", isDefault: true })
    await expect(alice.mutation(api.vehicles.create, { name: "X", triggerKey: "city" })).rejects.toThrow("already in use")

    const shortcutTrip = await alice.mutation(api.trips.start, {
      clientId: "a",
      startSource: "shortcut",
      startedAt: T0,
      tzOffsetMin: TZ,
      vehicleKey: "city",
    })
    expect(await alice.query(api.trips.get, { tripId: shortcutTrip })).toMatchObject({ vehicleId: city })

    await recordTrip(alice, "r1", [drive(T0 + 3_600_000, 60)], T0 + 3_659_000)
    // Same start and end as r1, but slower, so it is the longest by duration.
    await recordTrip(alice, "r2", [drive(T0 + 7_200_000, 90, 19, 590 / 89)], T0 + 7_289_000)
    const routes = await alice.query(api.analytics.frequentRoutes, {})
    expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ count: 2, lastAt: T0 + 7_200_000 })

    const records = await alice.query(api.analytics.records, {})
    expect(records.longestDuration).toMatchObject({ clientId: "r2", durationS: 89 })
    expect(records.biggestDay).toMatchObject({ tripCount: 2 })
  })
})
