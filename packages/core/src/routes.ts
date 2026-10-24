import type { LatLng } from "./geo"

export const ROUTE_CELL_M = 300

/**
 * Grid cell id for frequent-route grouping.
 * shortcut: a point near a cell edge can land in the next cell and split one route in two. Upgrade to path matching if groups look wrong.
 */
export function gridCell(p: LatLng, sizeM = ROUTE_CELL_M): string {
  const row = Math.floor((p.lat * 111_320) / sizeM)
  const rowLat = ((row + 0.5) * sizeM) / 111_320
  const col = Math.floor((p.lng * 111_320 * Math.cos((rowLat * Math.PI) / 180)) / sizeM)
  return `${row}:${col}`
}

/** Two trips are the same route when they share a start cell and an end cell. */
export const routeKey = (startCell: string, endCell: string) => `${startCell}>${endCell}`
