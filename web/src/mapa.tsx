import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

/** Lo que ve cada satélite: el tamaño real de su píxel alrededor de tu parcela. */
const ESCALAS = [
  { id: 'patio', nombre: 'Tu foto', lado_m: 12, color: '#3d7638', nota: 'Lo que ves tú: unos metros' },
  { id: 'hls', nombre: 'Landsat y Sentinel-2 (HLS)', lado_m: 30, color: '#8fae55', nota: '30 m: una cuadra pequeña' },
  { id: 'modis', nombre: 'MODIS', lado_m: 250, color: '#c4a46a', nota: '250 m: el verdor de tu barrio' },
  { id: 'smap', nombre: 'SMAP', lado_m: 9000, color: '#2e6a93', nota: '9 km: humedad del suelo de la zona' },
  { id: 'imerg', nombre: 'GPM IMERG', lado_m: 11100, color: '#6aa6d1', nota: '0.1°: lluvia de satélite' },
  { id: 'power', nombre: 'NASA POWER', lado_m: 55000, color: '#a04b2c', nota: '0.5°: clima regional' },
] as const

function cuadro(lat: number, lon: number, lado_m: number) {
  const dlat = lado_m / 2 / 111320, dlon = lado_m / 2 / (111320 * Math.cos((lat * Math.PI) / 180))
  return [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat], [lon + dlon, lat + dlat], [lon - dlon, lat + dlat], [lon - dlon, lat - dlat]]
}

export default function Mapa({ lat, lon }: { lat: number; lon: number }) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<import('maplibre-gl').Map | null>(null)
  const [sel, setSel] = useState<(typeof ESCALAS)[number]['id']>('modis')

  useEffect(() => {
    let vivo = true
    import('maplibre-gl').then((ml) => {
      if (!vivo || !div.current) return
      ml.setWorkerUrl(workerUrl) // Vite empaqueta MapLibre aparte y pierde la ruta de su worker
      const m = new ml.Map({
        container: div.current,
        style: {
          version: 8,
          sources: {
            osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
            escalas: {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: ESCALAS.map((e) => ({ type: 'Feature', properties: { id: e.id, color: e.color }, geometry: { type: 'Polygon', coordinates: [cuadro(lat, lon, e.lado_m)] } })),
              },
            },
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm' },
            { id: 'relleno', type: 'fill', source: 'escalas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } },
            { id: 'borde', type: 'line', source: 'escalas', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } },
          ],
        },
        center: [lon, lat],
        zoom: 14,
        attributionControl: { compact: true },
      })
      mapa.current = m
    })
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null }
  }, [lat, lon])

  useEffect(() => {
    const e = ESCALAS.find((x) => x.id === sel)!
    const c = cuadro(lat, lon, e.lado_m * 1.6)
    mapa.current?.fitBounds([c[0] as [number, number], c[2] as [number, number]], { duration: 900 })
  }, [sel, lat, lon])

  const e = ESCALAS.find((x) => x.id === sel)!
  return (
    <div>
      <div ref={div} className="mapa" role="img" aria-label={`Mapa con el tamaño del píxel de ${e.nombre}`} />
      <div className="chips" style={{ marginTop: '0.7rem' }}>
        {ESCALAS.map((x) => (
          <button key={x.id} className="chip" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
            <span style={{ display: 'inline-block', width: '0.7em', height: '0.7em', background: x.color, borderRadius: 2, marginRight: '0.4em' }} />
            {x.nombre}
          </button>
        ))}
      </div>
      <p className="nota">{e.nota}. Un píxel más grande que tu parcela promedia todo lo que hay alrededor: casas, calles y árboles.</p>
    </div>
  )
}
