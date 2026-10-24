"use client"

import { api } from "@vyra/backend/convex/_generated/api"
import type { Id } from "@vyra/backend/convex/_generated/dataModel"
import { usePaginatedQuery, useQuery } from "convex/react"
import Link from "next/link"
import { useState } from "react"
import { dateTime, duration, km, kmh } from "@/lib/ui"

const PAGE = 50

export default function TripsPage() {
  const vehicles = useQuery(api.vehicles.list)
  const [vehicleId, setVehicleId] = useState<Id<"vehicles"> | "">("")
  const { results, status, loadMore } = usePaginatedQuery(api.trips.list, vehicleId ? { vehicleId } : {}, {
    initialNumItems: PAGE,
  })
  const names = new Map(vehicles?.map((v) => [v._id, v.name]))

  return (
    <>
      <div className="mt-4 flex items-center gap-3 text-sm">
        <h1 className="m-0">Trips</h1>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value as Id<"vehicles"> | "")}>
          <option value="">All vehicles</option>
          {vehicles?.map((v) => (
            <option key={v._id} value={v._id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <table className="mt-3">
        <thead>
          <tr>
            <th>Date</th>
            <th>Vehicle</th>
            <th className="n">Distance</th>
            <th className="n">Duration</th>
            <th className="n">Avg</th>
            <th className="n">Max</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.map((t) => (
            <tr key={t._id}>
              <td>
                <Link href={`/trips/${t._id}`} className="u">
                  {dateTime(t.startedAt)}
                </Link>
              </td>
              <td>{t.vehicleId ? names.get(t.vehicleId) : ""}</td>
              <td className="n">{km(t.distanceM)}</td>
              <td className="n">{duration(t.durationS)}</td>
              <td className="n">{kmh(t.avgSpeedMps)}</td>
              <td className="n">{kmh(t.maxSpeedMps)}</td>
              <td>{t.status === "recording" ? "recording" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status === "LoadingFirstPage" && <p className="mt-3 text-sm">Loading</p>}
      {status === "Exhausted" && results.length === 0 && <p className="mt-3 text-sm">No trips.</p>}
      {status === "CanLoadMore" && (
        <button className="mt-3" onClick={() => loadMore(PAGE)}>
          Load more
        </button>
      )}
    </>
  )
}
