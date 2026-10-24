"use client"

import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc } from "@vyra/backend/convex/_generated/dataModel"
import { useQuery } from "convex/react"
import Link from "next/link"
import { ActivityCalendar } from "@/components/ActivityCalendar"
import { date, duration, km, kmh, localDay, time } from "@/lib/ui"

type Day = Doc<"dailyTotals">

function totals(days: Day[], from: string) {
  const rows = days.filter((d) => d.day >= from)
  return {
    trips: rows.reduce((s, d) => s + d.tripCount, 0),
    distanceM: rows.reduce((s, d) => s + d.distanceM, 0),
    durationS: rows.reduce((s, d) => s + d.durationS, 0),
    maxSpeedMps: Math.max(0, ...rows.map((d) => d.maxSpeedMps)),
  }
}

export default function Dashboard() {
  // shortcut: loads every dailyTotals row (one per driving day). Fine for years of data, query ranges if it gets slow.
  const days = useQuery(api.analytics.daily, { fromDay: "0000-01-01", toDay: "9999-12-31" })
  const records = useQuery(api.analytics.records)
  const live = useQuery(api.trips.live)

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const weekStart = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7))
  const periods = [
    ["This week", localDay(weekStart)],
    ["This month", localDay(new Date(y, m, 1))],
    ["This year", localDay(new Date(y, 0, 1))],
    ["All time", ""],
  ] as const

  return (
    <>
      {live && (
        <p className="mt-4 text-sm">
          Recording since {time(live.startedAt)}, {km(live.distanceM)}, {live.pointCount} points.{" "}
          <Link href={`/trips/${live._id}`} className="u">
            Open
          </Link>
        </p>
      )}

      <h2>Totals</h2>
      <table className="max-w-2xl">
        <thead>
          <tr>
            <th />
            <th className="n">Trips</th>
            <th className="n">Distance</th>
            <th className="n">Time</th>
            <th className="n">Top speed</th>
          </tr>
        </thead>
        <tbody>
          {periods.map(([label, from]) => {
            const t = days && totals(days, from)
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className="n">{t?.trips ?? ""}</td>
                <td className="n">{t ? km(t.distanceM) : ""}</td>
                <td className="n">{t ? duration(t.durationS) : ""}</td>
                <td className="n">{t ? kmh(t.maxSpeedMps) : ""}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>Last 12 months</h2>
      {days && <ActivityCalendar days={days} />}

      <h2>Records</h2>
      {records && (
        <table className="max-w-xl">
          <tbody>
            <RecordRow label="Longest distance" trip={records.longestDistance} value={(t) => km(t.distanceM)} />
            <RecordRow label="Longest time" trip={records.longestDuration} value={(t) => duration(t.durationS)} />
            <RecordRow label="Top speed" trip={records.topSpeed} value={(t) => kmh(t.maxSpeedMps)} />
            <tr>
              <td>Biggest day</td>
              <td className="n">{records.biggestDay ? km(records.biggestDay.distanceM) : ""}</td>
              <td>{records.biggestDay ? `${records.biggestDay.day}, ${records.biggestDay.tripCount} trips` : ""}</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

function RecordRow({ label, trip, value }: { label: string; trip: Doc<"trips"> | null; value: (t: Doc<"trips">) => string }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="n">{trip ? value(trip) : ""}</td>
      <td>
        {trip && (
          <Link href={`/trips/${trip._id}`} className="u">
            {date(trip.startedAt)}
          </Link>
        )}
      </td>
    </tr>
  )
}
