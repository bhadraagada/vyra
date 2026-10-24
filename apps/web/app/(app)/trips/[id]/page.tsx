"use client"

import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc, Id } from "@vyra/backend/convex/_generated/dataModel"
import type { GpsPoint } from "@vyra/core"
import { useMutation, useQuery } from "convex/react"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { SpeedChart } from "@/components/SpeedChart"
import { TripMap } from "@/components/TripMap"
import { dateTime, duration, km, kmh, run, time } from "@/lib/ui"

export default function TripPage() {
  const { id } = useParams<{ id: Id<"trips"> }>()
  const trip = useQuery(api.trips.get, { tripId: id })
  const points = useQuery(api.trips.points, trip ? { tripId: id } : "skip")
  const vehicles = useQuery(api.vehicles.list)

  if (trip === undefined) return <p className="mt-4 text-sm">Loading</p>
  if (trip === null) return <p className="mt-4 text-sm">Trip not found.</p>
  const vehicle = vehicles?.find((v) => v._id === trip.vehicleId)

  return (
    <>
      <h1>
        {dateTime(trip.startedAt)}
        {trip.status === "recording" && " (recording)"}
      </h1>
      {points && <TripView trip={trip} points={points} />}
      <h2>Stats</h2>
      <table className="max-w-md">
        <tbody>
          {[
            ["Start", dateTime(trip.startedAt)],
            ["End", trip.endedAt ? dateTime(trip.endedAt) : ""],
            ["Vehicle", vehicle?.name ?? ""],
            ["Distance", km(trip.distanceM)],
            ["Duration", duration(trip.durationS)],
            ["Moving", duration(trip.movingS)],
            ["Avg speed", kmh(trip.avgSpeedMps)],
            ["Max speed", kmh(trip.maxSpeedMps)],
            ["Points", String(trip.pointCount)],
            ["Started by", trip.startSource],
            ["Stopped by", trip.stopReason ?? ""],
          ].map(([k, v]) => (
            <tr key={k}>
              <td className="text-neutral-400">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trip.status === "completed" && <Edits trip={trip} vehicles={vehicles ?? []} />}
    </>
  )
}

/** Map and speed chart. For completed trips it also has the trim range, which both of them preview. */
function TripView({ trip, points }: { trip: Doc<"trips">; points: GpsPoint[] }) {
  const trim = useMutation(api.trips.trim)
  const start = points[0]?.t ?? trip.startedAt
  const end = points.at(-1)?.t ?? trip.endedAt ?? trip.startedAt
  // Null means the whole trip. Live points keep growing, so a fixed range would go stale.
  const [range, setRange] = useState<[number, number] | null>(null)
  const [a, b] = range ?? [start, end]
  const trimmed = a > start || b < end
  const kept = trimmed ? points.filter((p) => p.t >= a && p.t <= b) : undefined
  // An untouched handle keeps the stored trip edge instead of snapping it to the first or last point.
  const saveTrim = () =>
    void run(
      trim({ tripId: trip._id, startAt: a > start ? a : trip.startedAt, endAt: b < end ? b : (trip.endedAt ?? b) }).then(() =>
        setRange(null),
      ),
    )

  return (
    <>
      <TripMap line={points} selection={kept} />
      <h2>Speed, km/h</h2>
      <SpeedChart points={points} range={trimmed ? [a, b] : undefined} />
      {trip.status === "completed" && end > start && (
        <>
          <h2>Trim</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="w-16">{time(a)}</span>
            <input
              type="range"
              aria-label="Trim start"
              className="flex-1 p-0"
              min={start}
              max={end}
              step={1000}
              value={a}
              onChange={(e) => setRange([Math.min(Number(e.target.value), b - 1000), b])}
            />
            <input
              type="range"
              aria-label="Trim end"
              className="flex-1 p-0"
              min={start}
              max={end}
              step={1000}
              value={b}
              onChange={(e) => setRange([a, Math.max(Number(e.target.value), a + 1000)])}
            />
            <span className="w-16 text-right">{time(b)}</span>
            <button disabled={!trimmed} onClick={saveTrim}>
              Trim
            </button>
            <button disabled={!trimmed} onClick={() => setRange(null)}>
              Reset
            </button>
          </div>
        </>
      )}
    </>
  )
}

function Edits({ trip, vehicles }: { trip: Doc<"trips">; vehicles: Doc<"vehicles">[] }) {
  const router = useRouter()
  const remove = useMutation(api.trips.remove)
  const setVehicle = useMutation(api.trips.setVehicle)
  const merge = useMutation(api.trips.merge)
  // shortcut: finds neighbours only among the 200 newest trips. Add a backend "adjacent" query if older trips need merging.
  const recent = useQuery(api.trips.list, { paginationOpts: { numItems: 200, cursor: null } })
  const i = recent?.page.findIndex((t) => t._id === trip._id) ?? -1
  const older = i >= 0 ? recent?.page[i + 1] : undefined
  const newer = i > 0 ? recent?.page[i - 1] : undefined

  // The earlier trip is kept, so the merged trip keeps its id and vehicle.
  const mergeWith = (first: Doc<"trips">, second: Doc<"trips">) =>
    void run(merge({ firstId: first._id, secondId: second._id }).then(() => router.replace(`/trips/${first._id}`)))

  return (
    <>
      <h2>Edit</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          value={trip.vehicleId ?? ""}
          onChange={(e) => void run(setVehicle({ tripId: trip._id, vehicleId: (e.target.value || null) as Id<"vehicles"> | null }))}
        >
          <option value="">No vehicle</option>
          {vehicles
            .filter((v) => !v.archived || v._id === trip.vehicleId)
            .map((v) => (
              <option key={v._id} value={v._id}>
                {v.name}
              </option>
            ))}
        </select>
        {older?.status === "completed" && (
          <button onClick={() => mergeWith(older, trip)}>Merge with previous ({dateTime(older.startedAt)}, {km(older.distanceM)})</button>
        )}
        {newer?.status === "completed" && (
          <button onClick={() => mergeWith(trip, newer)}>Merge with next ({dateTime(newer.startedAt)}, {km(newer.distanceM)})</button>
        )}
        <button
          onClick={() => {
            if (confirm("Delete this trip?")) void run(remove({ tripId: trip._id }).then(() => router.push("/trips")))
          }}
        >
          Delete
        </button>
      </div>
    </>
  )
}
