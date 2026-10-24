import { dayKey, localTzOffsetMin } from "@vyra/core"
import { ConvexError } from "convex/values"
import type { FormEvent } from "react"

export const km = (m: number) => `${(m / 1000).toFixed(1)} km`
export const kmh = (mps: number) => `${Math.round(mps * 3.6)} km/h`

/** "1h 05m" or "12m". */
export function duration(s: number) {
  const min = Math.round(s / 60)
  const h = Math.floor(min / 60)
  return h ? `${h}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`
}

export const dateTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
export const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { timeStyle: "short" })
export const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" })

/** Browser-local "YYYY-MM-DD", the same key format as dailyTotals. */
export const localDay = (d: Date) => dayKey(d.getTime(), localTzOffsetMin(d))

/** Value for a datetime-local input, and back. */
export const toInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
export const fromInput = (value: string) => new Date(value).getTime()

/** User-facing text for a thrown error. ConvexError messages are written for users. */
export const errorText = (e: unknown) =>
  e instanceof ConvexError ? String(e.data) : e instanceof Error ? e.message : "Something went wrong"

/** Runs a mutation and shows its error. */
export const run = (p: Promise<unknown>) => p.catch((e: unknown) => alert(errorText(e)))

/** Form submit handler that reads FormData, runs the mutation and clears the form on success. */
export const onForm = (handler: (fd: FormData) => Promise<unknown>) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  const form = e.currentTarget
  void run(handler(new FormData(form)).then(() => form.reset()))
}

/** Trimmed text field, undefined when empty. */
export function text(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

/** Number field, undefined when empty. */
export function num(fd: FormData, name: string) {
  const v = text(fd, name)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`)
  return n
}

/** Required number field. */
export function need(fd: FormData, name: string) {
  const n = num(fd, name)
  if (n === undefined) throw new Error(`${name} is required`)
  return n
}

/** datetime-local field as epoch ms. */
export function at(fd: FormData, name = "at") {
  const v = text(fd, name)
  const ms = v ? fromInput(v) : NaN
  if (!Number.isFinite(ms)) throw new Error("Date is required")
  return ms
}
