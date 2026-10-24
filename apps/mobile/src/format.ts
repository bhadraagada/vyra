export const km = (m: number) => `${(m / 1000).toFixed(m < 100_000 ? 1 : 0)} km`
export const kmh = (mps: number) => `${Math.round(mps * 3.6)} km/h`

/** "1:05:09" or "5:09". */
export function duration(s: number) {
  const total = Math.max(0, Math.floor(s))
  const h = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60))
  const ss = String(total % 60).padStart(2, "0")
  return h > 0 ? `${h}:${mm.padStart(2, "0")}:${ss}` : `${mm}:${ss}`
}

export const dateTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
export const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })

/** Message of a ConvexError, or a plain fallback for anything else. */
export const errorText = (e: unknown) =>
  e !== null && typeof e === "object" && "data" in e && typeof e.data === "string" ? e.data : "Something went wrong. Try again."
