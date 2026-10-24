export type LatLng = { lat: number; lng: number }

/** One GPS sample from the phone. Times are epoch ms (UTC). */
export type GpsPoint = LatLng & {
  t: number
  /** Doppler speed from the GPS chip in m/s, null when iOS reports it as invalid. */
  speed: number | null
  /** Horizontal accuracy radius in metres. */
  accuracy: number
  heading: number | null
  altitude: number | null
}

const EARTH_RADIUS_M = 6_371_008.8
const toRad = (deg: number) => (deg * Math.PI) / 180

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Douglas-Peucker line simplification. Returns [lat, lng] pairs for map lists and previews.
 * Uses a flat projection around each segment, which is accurate enough at trip scale.
 */
export function simplify(points: readonly LatLng[], toleranceM = 15): [number, number][] {
  if (points.length <= 2) return points.map((p) => [p.lat, p.lng])
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegmentM(points[i]!, points[first]!, points[last]!)
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1).map((p) => [p.lat, p.lng])
}

function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(toRad(a.lat))
  const bx = (b.lng - a.lng) * mPerDegLng
  const by = (b.lat - a.lat) * mPerDegLat
  const px = (p.lng - a.lng) * mPerDegLng
  const py = (p.lat - a.lat) * mPerDegLat
  const lenSq = bx * bx + by * by
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq))
  return Math.hypot(px - t * bx, py - t * by)
}
