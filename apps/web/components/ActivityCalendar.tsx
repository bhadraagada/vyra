import { km, localDay } from "@/lib/ui"

const CELL = 11
const STEP = 13
const WEEKS = 53

/** Week columns for the last 12 months, Monday first. Days after today are null. */
export function calendarWeeks(today: Date) {
  const monday = today.getDate() - ((today.getDay() + 6) % 7)
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(today.getFullYear(), today.getMonth(), monday - (WEEKS - 1 - w) * 7 + d)
      return day > today ? null : day
    }),
  )
}

/** One square per day, brighter for more distance. */
export function ActivityCalendar({ days }: { days: { day: string; distanceM: number }[] }) {
  const byDay = new Map(days.map((d) => [d.day, d.distanceM]))
  const weeks = calendarWeeks(new Date())
  const max = Math.max(1, ...weeks.flat().map((d) => (d ? (byDay.get(localDay(d)) ?? 0) : 0)))
  return (
    <svg viewBox={`0 0 ${WEEKS * STEP + 24} ${7 * STEP + 14}`} className="w-full max-w-3xl">
      {weeks.map((week, w) => {
        const first = week[0]
        const label = first && first.getDate() <= 7 ? first.toLocaleString(undefined, { month: "short" }) : null
        return (
          <g key={w} transform={`translate(${24 + w * STEP} 0)`}>
            {label && (
              <text y={9} fontSize={9} fill="#888">
                {label}
              </text>
            )}
            {week.map((day, d) => {
              if (!day) return null
              const key = localDay(day)
              const dist = byDay.get(key) ?? 0
              return (
                <rect
                  key={d}
                  y={14 + d * STEP}
                  width={CELL}
                  height={CELL}
                  fill={dist ? "#fff" : "#1a1a1a"}
                  fillOpacity={dist ? 0.2 + 0.8 * Math.sqrt(dist / max) : 1}
                >
                  <title>{`${key}: ${km(dist)}`}</title>
                </rect>
              )
            })}
          </g>
        )
      })}
      {["Mon", "Wed", "Fri"].map((label, i) => (
        <text key={label} y={14 + i * 2 * STEP + 9} fontSize={9} fill="#888">
          {label}
        </text>
      ))}
    </svg>
  )
}
