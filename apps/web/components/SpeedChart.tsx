import { haversineM, MAX_PLAUSIBLE_SPEED_MPS, type GpsPoint } from "@vyra/core"
import { time } from "@/lib/ui"

const W = 1000
const H = 200
const L = 44
const T = 8
const B = 22
/** A longer time without points, such as the stop between two merged trips, breaks the line. */
const GAP_MS = 60_000

/** km/h per point. GPS speed first, else the implied speed from the previous point. Null leaves a gap. */
export function speedSeries(points: readonly GpsPoint[]) {
  return points.map((p, i) => {
    const prev = points[i - 1]
    const dt = prev ? (p.t - prev.t) / 1000 : 0
    const mps = p.speed ?? (prev && dt >= 1 ? haversineM(prev, p) / dt : null)
    return { t: p.t, kmh: mps !== null && mps >= 0 && mps <= MAX_PLAUSIBLE_SPEED_MPS ? mps * 3.6 : null }
  })
}

/** Speed over time. `range` dims everything outside [start, end]. */
export function SpeedChart({ points, range }: { points: readonly GpsPoint[]; range?: [number, number] }) {
  const t0 = points[0]?.t ?? 0
  const t1 = points.at(-1)?.t ?? 0
  if (t1 <= t0) return null
  const series = speedSeries(points)
  const top = series.reduce((m, s) => Math.max(m, s.kmh ?? 0), 0)
  const step = top > 100 ? 40 : 20
  const yMax = Math.max(step, Math.ceil(top / step) * step)
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L)
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B)

  let d = ""
  let lastT = -Infinity
  for (const s of series) {
    if (s.kmh === null) {
      lastT = -Infinity
      continue
    }
    d += `${s.t - lastT > GAP_MS ? "M" : "L"}${x(s.t).toFixed(1)} ${y(s.kmh).toFixed(1)}`
    lastT = s.t
  }

  const grid = Array.from({ length: yMax / step + 1 }, (_, i) => i * step)
  const ticks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#222" />
          <text x={L - 6} y={y(v) + 4} fontSize={11} fill="#888" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {ticks.map((t, i) => (
        <text key={t} x={x(t)} y={H - 6} fontSize={11} fill="#888" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
          {time(t)}
        </text>
      ))}
      <path d={d} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
      {range && (
        <g fill="#000" fillOpacity={0.75}>
          <rect x={L} y={0} width={Math.max(0, x(range[0]) - L)} height={H - B} />
          <rect x={x(range[1])} y={0} width={Math.max(0, W - x(range[1]))} height={H - B} />
        </g>
      )}
    </svg>
  )
}
