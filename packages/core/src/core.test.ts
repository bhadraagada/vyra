import { describe, expect, it } from "vitest"
import {
  fuelSpans,
  gridCell,
  haversineM,
  IDLE_STOP_MS,
  idle,
  nextState,
  simplify,
  tripStats,
  type GpsPoint,
  type TripEvent,
  type TripState,
} from "./index"

const pt = (t: number, lat: number, lng: number, speed: number | null = 10, accuracy = 5): GpsPoint => ({
  t,
  lat,
  lng,
  speed,
  accuracy,
  heading: null,
  altitude: null,
})

const run = (events: TripEvent[], from: TripState = idle) => events.reduce(nextState, from)

describe("tripMachine", () => {
  it("keeps a connected trip alive through a long traffic jam", () => {
    const s = run([
      { type: "start", at: 0, source: "shortcut", vehicleKey: "swift" },
      { type: "activity", at: 1_000, activity: "stationary" },
      { type: "tick", at: 60 * 60_000 },
    ])
    expect(s.kind).toBe("recording")
  })

  it("ends on 1 min of walking and backdates the end to the last movement", () => {
    const s = run([
      { type: "start", at: 0, source: "motion" },
      { type: "location", point: pt(30_000, 19, 72, 12) },
      { type: "activity", at: 40_000, activity: "walking" },
      { type: "tick", at: 100_000 },
    ])
    expect(s).toMatchObject({ kind: "completed", reason: "walking", endedAt: 30_000 })
  })

  it("does not move the end of a walking stop to walking-speed GPS points", () => {
    const s = run([
      { type: "start", at: 0, source: "motion" },
      { type: "location", point: pt(30_000, 19, 72, 12) },
      { type: "activity", at: 40_000, activity: "walking" },
      { type: "location", point: pt(70_000, 19, 72, 1.5) },
      { type: "tick", at: 100_000 },
    ])
    expect(s).toMatchObject({ kind: "completed", reason: "walking", endedAt: 30_000 })
  })

  it("ends an unconnected trip after the idle timeout", () => {
    const s = run([
      { type: "start", at: 0, source: "manual" },
      { type: "location", point: pt(5_000, 19, 72, 8) },
      { type: "tick", at: 5_000 + IDLE_STOP_MS },
    ])
    expect(s).toMatchObject({ kind: "completed", reason: "idle_timeout", endedAt: 5_000 })
  })

  it("merges a motion start and a later Shortcut start into one trip", () => {
    const s = run([
      { type: "start", at: 0, source: "motion" },
      { type: "start", at: 2_000, source: "shortcut", vehicleKey: "swift" },
    ])
    expect(s).toMatchObject({ kind: "recording", source: "motion", vehicleKey: "swift", carConnected: true })
  })
})

describe("tripStats", () => {
  it("drops a GPS jump and inaccurate points", () => {
    const points = [
      pt(0, 19.0, 72.0),
      pt(10_000, 19.001, 72.0),
      pt(11_000, 19.5, 72.0), // jump of ~55 km in 1 s
      pt(12_000, 19.002, 72.0, 10, 200), // bad accuracy
      pt(20_000, 19.002, 72.0),
    ]
    const s = tripStats(points)
    expect(s.distanceM).toBeCloseTo(haversineM(points[0]!, points[4]!), 0)
    expect(s.durationS).toBe(20)
    expect(s.maxSpeedMps).toBe(10)
  })
})

describe("simplify", () => {
  it("drops points on a straight line", () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ lat: 19 + i * 0.0001, lng: 72 }))
    expect(simplify(line)).toHaveLength(2)
  })
})

describe("fuelSpans", () => {
  it("adds partial fills to the span between two full fills", () => {
    const spans = fuelSpans([
      { at: 1, odometerKm: 1000, litres: 30, totalCost: 3000, fullTank: true },
      { at: 2, odometerKm: 1200, litres: 10, totalCost: 1000, fullTank: false },
      { at: 3, odometerKm: 1500, litres: 15, totalCost: 1500, fullTank: true },
    ])
    expect(spans).toEqual([{ at: 3, km: 500, litres: 25, cost: 2500, kmPerL: 20, costPerKm: 5 }])
  })
})

describe("gridCell", () => {
  it("puts points 50 m apart in the same cell and points 1 km apart in different cells", () => {
    const home = { lat: 19.07605, lng: 72.87705 }
    expect(gridCell(home)).toBe(gridCell({ lat: 19.07605, lng: 72.8775 }))
    expect(gridCell(home)).not.toBe(gridCell({ lat: 19.086, lng: 72.877 }))
  })
})
