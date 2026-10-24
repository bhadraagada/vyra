"use client"

import "maplibre-gl/dist/maplibre-gl.css"
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"

type Line = readonly { lat: number; lng: number }[]

const STYLE = "https://tiles.openfreemap.org/styles/dark"

const feature = (line: Line) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: line.map((p) => [p.lng, p.lat]) },
})

/** MapLibre map of a route. `selection` is drawn bright on top of the dimmed full route. */
export function TripMap({ line, selection }: { line: Line; selection?: Line }) {
  const el = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    let m: MapLibreMap | undefined
    let cancelled = false
    // Imported here because maplibre-gl needs window.
    void import("maplibre-gl").then(({ Map, setWorkerUrl }) => {
      if (cancelled || !el.current) return
      // maplibre finds its worker from its own import.meta.url, which the bundler rewrites. Point it at the file.
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href)
      const created = new Map({ container: el.current, style: STYLE, attributionControl: { compact: true } })
      m = created
      created.on("load", () => {
        for (const [id, color, width] of [
          ["route", "#666", 3],
          ["selection", "#fff", 4],
        ] as const) {
          created.addSource(id, { type: "geojson", data: feature([]) })
          created.addLayer({ id, type: "line", source: id, paint: { "line-color": color, "line-width": width }, layout: { "line-cap": "round", "line-join": "round" } })
        }
        setMap(created)
      })
    })
    return () => {
      cancelled = true
      m?.remove()
    }
  }, [])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>("route")?.setData(feature(line))
    map.getSource<GeoJSONSource>("selection")?.setData(feature(selection ?? line))
    // Fit once, so live updates do not move the map under the user.
    if (fitted.current || line.length < 2) return
    fitted.current = true
    const lngs = line.map((p) => p.lng)
    const lats = line.map((p) => p.lat)
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 40, duration: 0 },
    )
  }, [map, line, selection])

  return <div ref={el} className="h-[420px] w-full" />
}
