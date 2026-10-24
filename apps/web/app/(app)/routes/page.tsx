"use client"

import { api } from "@vyra/backend/convex/_generated/api"
import { useQuery } from "convex/react"
import { RoutePreview } from "@/components/RoutePreview"
import { date, km } from "@/lib/ui"

export default function RoutesPage() {
  const routes = useQuery(api.analytics.frequentRoutes)
  return (
    <>
      <h1>Frequent routes</h1>
      {routes?.length === 0 && <p className="text-sm">No route driven twice yet.</p>}
      <table>
        <thead>
          <tr>
            <th />
            <th className="n">Trips</th>
            <th className="n">Avg distance</th>
            <th className="n">Total</th>
            <th>Last driven</th>
          </tr>
        </thead>
        <tbody>
          {routes?.map((r) => (
            <tr key={r.routeKey}>
              <td className="w-32">
                <RoutePreview line={r.polyline} />
              </td>
              <td className="n">{r.count}</td>
              <td className="n">{km(r.distanceM / r.count)}</td>
              <td className="n">{km(r.distanceM)}</td>
              <td>{date(r.lastAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
