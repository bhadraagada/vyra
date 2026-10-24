export type FuelFill = { at: number; odometerKm: number; litres: number; totalCost: number; fullTank: boolean }

export type FuelSpan = { at: number; km: number; litres: number; cost: number; kmPerL: number; costPerKm: number }

/**
 * Fill-to-fill economy. A span runs from one full fill to the next full fill.
 * Partial fills inside a span add their litres and cost to that span.
 */
export function fuelSpans(fills: readonly FuelFill[]): FuelSpan[] {
  const sorted = [...fills].sort((a, b) => a.odometerKm - b.odometerKm)
  const spans: FuelSpan[] = []
  let anchor: FuelFill | null = null
  let litres = 0
  let cost = 0
  for (const fill of sorted) {
    if (anchor) {
      litres += fill.litres
      cost += fill.totalCost
    }
    if (!fill.fullTank) continue
    if (anchor) {
      const km = fill.odometerKm - anchor.odometerKm
      if (km > 0 && litres > 0) spans.push({ at: fill.at, km, litres, cost, kmPerL: km / litres, costPerKm: cost / km })
    }
    anchor = fill
    litres = 0
    cost = 0
  }
  return spans
}
