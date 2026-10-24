import type { GpsPoint } from "./geo"

/** Points per uploaded chunk. About 25 KB per chunk, far below the Convex 1 MiB document limit. */
export const CHUNK_SIZE = 500

/** Column layout of the tripChunks table. Arrays are smaller than one object per point. */
export type PointColumns = {
  t: number[]
  lat: number[]
  lng: number[]
  speed: (number | null)[]
  accuracy: number[]
  heading: (number | null)[]
  altitude: (number | null)[]
}

export function toColumns(points: readonly GpsPoint[]): PointColumns {
  return {
    t: points.map((p) => p.t),
    lat: points.map((p) => p.lat),
    lng: points.map((p) => p.lng),
    speed: points.map((p) => p.speed),
    accuracy: points.map((p) => p.accuracy),
    heading: points.map((p) => p.heading),
    altitude: points.map((p) => p.altitude),
  }
}

export function fromColumns(c: PointColumns): GpsPoint[] {
  return c.t.map((t, i) => ({
    t,
    lat: c.lat[i]!,
    lng: c.lng[i]!,
    speed: c.speed[i] ?? null,
    accuracy: c.accuracy[i]!,
    heading: c.heading[i] ?? null,
    altitude: c.altitude[i] ?? null,
  }))
}
