import { describe, expect, it } from "vitest"
import { ConvexError } from "convex/values"
import type { GpsPoint } from "@vyra/core"
import { backoffMs, isBusy, isPermanent, retryBusy, shouldStore, tokenFor } from "./rules"

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

describe("retryBusy", () => {
  const locked = new Error("Calling the 'execAsync' function has failed\n→ Caused by: Error code 5: database is locked")

  it("knows SQLite lock errors", () => {
    expect(isBusy(locked)).toBe(true)
    expect(isBusy(new Error("Error code 6: database table is locked"))).toBe(true)
    expect(isBusy(new Error("Error code 19: UNIQUE constraint failed"))).toBe(false)
  })
  it("runs again while the database is locked", async () => {
    let calls = 0
    const result = await retryBusy(async () => {
      if (++calls < 3) throw locked
      return "saved"
    })
    expect([result, calls]).toEqual(["saved", 3])
  })
  it("gives up after the last try and does not retry other errors", async () => {
    let calls = 0
    await expect(retryBusy(() => Promise.reject(locked).finally(() => calls++), 2)).rejects.toBe(locked)
    expect(calls).toBe(2)
    const other = new Error("Error code 19: UNIQUE constraint failed")
    await expect(retryBusy(() => Promise.reject(other).finally(() => calls++))).rejects.toBe(other)
    expect(calls).toBe(3)
  })
})

describe("tokenFor", () => {
  const alice = { userId: "alice", token: "alice-token" }
  it("sends the owner's trip with the owner's token", () => expect(tokenFor("alice", alice)).toBe("alice-token"))
  it("holds a trip of another account", () => expect(tokenFor("bob", alice)).toBeNull())
  it("holds every trip while signed out", () => expect(tokenFor("alice", null)).toBeNull())
  it("holds a trip with no owner", () => expect(tokenFor(null, alice)).toBeNull())
})
