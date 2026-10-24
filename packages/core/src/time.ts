/** Offset of the phone from UTC in minutes east, such as +330 for IST. Store it on each trip. */
export const localTzOffsetMin = (at = new Date()) => -at.getTimezoneOffset()

/** Local calendar day "YYYY-MM-DD" for a UTC timestamp, from the stored offset of the trip. */
export const dayKey = (ms: number, tzOffsetMin: number) => new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10)
