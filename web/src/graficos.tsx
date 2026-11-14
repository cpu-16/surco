import type { Normal, Ninos } from './api'

export const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** 12 meses empezando en el mes actual (1-12). */
export const ordenMeses = (desde: number) => Array.from({ length: 12 }, (_, i) => ((desde - 1 + i) % 12) + 1)

/** Lluvia normal (barras), ET₀ (marca) y lluvia esperada si el Niño se porta como los anteriores (barra rayada). */
export function BarrasLluvia({ normales, ninos, desde }: { normales: Normal[]; ninos?: Ninos; desde: number }) {
  const meses = ordenMeses(desde)
  const W = 360, H = 170, base = 140, ancho = W / 12
  const max = Math.max(...normales.map((n) => Math.max(n.lluvia, n.et0)), 1)
  const y = (v: number) => base - (v / max) * 120
  const pct = (m: number) => ninos?.promedio.find((p) => p.mes === m)?.pct_normal ?? null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="Lluvia normal por mes, demanda de agua y lluvia en años de El Niño fuerte">
      <defs>
        <pattern id="raya" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.2" height="5" fill="var(--lluvia)" />
        </pattern>
      </defs>
      {meses.map((m, i) => {
        const n = normales[m - 1], x = i * ancho, p = pct(m)
        return (
          <g key={m}>
            <rect x={x + 3} y={y(n.lluvia)} width={ancho - 6} height={base - y(n.lluvia)} fill="var(--lluvia)" opacity={p == null ? 0.85 : 0.28} rx="2" />
            {p != null && <rect x={x + 7} y={y((n.lluvia * p) / 100)} width={ancho - 14} height={base - y((n.lluvia * p) / 100)} fill="url(#raya)" />}
            <line x1={x + 2} x2={x + ancho - 2} y1={y(n.et0)} y2={y(n.et0)} stroke="var(--seco)" strokeWidth="3" strokeLinecap="round" />
            <text x={x + ancho / 2} y={base + 16} textAnchor="middle" fontSize="12">{MESES[m - 1]}</text>
          </g>
        )
      })}
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--linea)" />
    </svg>
  )
}

/** Lluvia diaria reciente. Los días secos (menos de 1 mm) quedan marcados con un terrón al pie. */
export function Reciente({ dias }: { dias: { fecha: string; lluvia: number | null }[] }) {
  const W = 360, H = 96, base = H - 22, max = Math.max(...dias.map((d) => d.lluvia ?? 0), 10), a = W / dias.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Lluvia diaria: ${dias.filter((d) => (d.lluvia ?? 0) < 1).length} de ${dias.length} días sin lluvia`}>
      {dias.map((d, i) => {
        const v = d.lluvia ?? 0, h = (Math.sqrt(v) / Math.sqrt(max)) * (base - 6)
        return v < 1
          ? <rect key={d.fecha} x={i * a + a * 0.2} y={base - 3} width={a * 0.6} height={3} rx="1" fill="var(--laterita)" />
          : <rect key={d.fecha} x={i * a + a * 0.12} y={base - h} width={a * 0.76} height={h} rx="1.5" fill="var(--lluvia)" />
      })}
      <line x1="0" x2={W} y1={base + 0.5} y2={base + 0.5} stroke="var(--linea)" />
      <text x="0" y={H - 4} fontSize="12">{dias[0]?.fecha.slice(5).split('-').reverse().join('/')}</text>
      <text x={W} y={H - 4} fontSize="12" textAnchor="end">{dias.at(-1)?.fecha.slice(5).split('-').reverse().join('/')}</text>
    </svg>
  )
}

/** NDVI medio por mes del año (línea) desde el mes actual. */
export function NdviMeses({ meses, desde }: { meses: { mes: number; ndvi: number | null }[]; desde: number }) {
  const orden = ordenMeses(desde), W = 360, H = 110, a = W / 12
  const vals = meses.map((m) => m.ndvi).filter((v): v is number => v != null)
  const lo = Math.min(...vals) - 0.05, hi = Math.max(...vals) + 0.05
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 34)
  const pts = orden.map((m, i) => ({ x: i * a + a / 2, v: meses[m - 1]?.ndvi, m }))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Verdor medio (NDVI) por mes del año">
      <polyline fill="none" stroke="var(--hoja)" strokeWidth="2.5"
        points={pts.filter((p) => p.v != null).map((p) => `${p.x},${y(p.v!)}`).join(' ')} />
      {pts.map((p) => p.v != null && (
        <g key={p.m}>
          <circle cx={p.x} cy={y(p.v)} r="3.5" fill="var(--hoja)" />
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize="12">{MESES[p.m - 1]}</text>
        </g>
      ))}
    </svg>
  )
}
