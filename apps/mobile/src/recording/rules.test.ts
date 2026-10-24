import { describe, expect, it } from "vitest"
import { ConvexError } from "convex/values"
import type { GpsPoint } from "@vyra/core"
import { backoffMs, isPermanent, shouldStore } from "./rules"

const at = (t: number, lat: number): GpsPoint => ({ t, lat, lng: 0, speed: null, accuracy: 5, heading: null, altitude: null })

describe("shouldStore", () => {
  it("stores the first point", () => expect(shouldStore(null, at(0, 0))).toBe(true))
  it("skips a point under 3 m and under 10 s", () => expect(shouldStore(at(0, 0), at(5_000, 0.00002))).toBe(false))
  it("stores a point 3 m away", () => expect(shouldStore(at(0, 0), at(1_000, 0.00003))).toBe(true))
  it("stores a still point after 10 s", () => expect(shouldStore(at(0, 0), at(10_000, 0))).toBe(true))
})

describe("outbox retry", () => {
  it("doubles the delay up to 10 min", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5_000, 10_000, 20_000])
    expect(backoffMs(30)).toBe(600_000)
  })
  it("drops backend errors but retries auth and network errors", () => {
    expect(isPermanent(new ConvexError("Trip not found"))).toBe(true)
    expect(isPermanent(new ConvexError("Not signed in"))).toBe(false)
    expect(isPermanent(new TypeError("Network request failed"))).toBe(false)
  })
})
