/** Small SVG drawing of a [lat, lng] polyline, north up. */
export function RoutePreview({ line, w = 120, h = 72 }: { line: number[][]; w?: number; h?: number }) {
  const pts = line.filter((p): p is [number, number] => p.length === 2)
  if (pts.length < 2) return <svg width={w} height={h} />
  const cos = Math.cos((pts[0]![0] * Math.PI) / 180)
  const xy = pts.map(([lat, lng]) => [lng * cos, -lat] as const)
  const xs = xy.map((p) => p[0])
  const ys = xy.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-6)
  const scale = Math.min(w - 8, h - 8) / span
  const offX = (w - (Math.max(...xs) - minX) * scale) / 2
  const offY = (h - (Math.max(...ys) - minY) * scale) / 2
  const points = xy.map(([x, y]) => `${(offX + (x - minX) * scale).toFixed(1)},${(offY + (y - minY) * scale).toFixed(1)}`).join(" ")
  return (
    <svg width={w} height={h} className="block">
      <polyline points={points} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
