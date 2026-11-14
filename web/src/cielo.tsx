import { lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Lugar } from './api'
import { BarrasLluvia, NdviMeses, Reciente } from './graficos'
import { Cargando, fecha, Fuente, rango } from './ui'

const Mapa = lazy(() => import('./mapa'))

const PESTANAS = [['lluvia', 'Lluvia'], ['nino', 'El Niño'], ['verdor', 'Verdor'], ['pixeles', 'Píxeles']] as const
type Pestana = (typeof PESTANAS)[number][0]

export default function Cielo({ lugar, desde }: { lugar: Lugar | null; desde: number }) {
  const [tab, setTab] = useState<Pestana>('lluvia')
  if (!lugar) return <Cargando texto="Leyendo 45 años de clima de la NASA para tu punto…" />
  return (
    <>
      <div className="segmentos" role="tablist" aria-label="Datos de la NASA">
        {PESTANAS.map(([k, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {tab === k && <motion.span layoutId="seg" className="seg-fondo" transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }} />}
            <span className="seg-texto">{n}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={tab} role="tabpanel" className="panel"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
          {tab === 'lluvia' && <Lluvia lugar={lugar} />}
          {tab === 'nino' && <Nino lugar={lugar} desde={desde} />}
          {tab === 'verdor' && <Verdor lugar={lugar} desde={desde} />}
          {tab === 'pixeles' && <Suspense fallback={<div className="mapa" />}><Mapa lat={lugar.punto.lat} lon={lugar.punto.lon} /></Suspense>}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function Lluvia({ lugar }: { lugar: Lugar }) {
  const im = lugar.reciente_imerg
  const f = im ? lugar.fuentes.imerg : lugar.fuentes.power
  const dias = (im ?? lugar.reciente_power).dias.slice(-30)
  return (
    <>
      {im ? <Racha im={im} /> : (
        <p className="titular"><span className="cifra">{lugar.reciente_power.lluvia_30d}<small> mm</small></span><span>de lluvia en 30 días, hasta el {fecha(lugar.reciente_power.hasta)}</span></p>
      )}
      <Reciente dias={dias} />
      <p className="nota">
        {im ? `En los últimos 30 días cayeron ${im.lluvia_30d} mm en tu zona.` : 'La lluvia diaria del satélite GPM está en camino; esto es NASA POWER, que reparte la lluvia en 55 km.'}
      </p>
      {f && <Fuente titulo={`Consultado ${f.consultado}`}>{f.producto}, celda {f.celda}</Fuente>}
    </>
  )
}

function Racha({ im }: { im: NonNullable<Lugar['reciente_imerg']> }) {
  if (im.racha_seca_dias >= 2)
    return <p className="titular"><span className="cifra">{im.racha_seca_dias}<small> días</small></span><span>sin llover, hasta el {fecha(im.hasta)}</span></p>
  const r = im.ultima_racha
  if (r) {
    const despues = im.dias.filter((d) => d.fecha > r.hasta).reduce((a, d) => a + (d.lluvia ?? 0), 0)
    return (
      <p className="titular"><span className="cifra">{r.dias}<small> días</small></span>
        <span>sin llover, {rango(r.desde, r.hasta)}.{despues > 0 ? ` Después cayeron ${Math.round(despues * 10) / 10} mm.` : ''}</span></p>
    )
  }
  return <p className="titular"><span className="cifra">{im.lluvia_30d}<small> mm</small></span><span>en 30 días. Ha llovido casi todos los días.</span></p>
}

function Nino({ lugar, desde }: { lugar: Lugar; desde: number }) {
  const seco = lugar.ninos.promedio.filter((p) => [1, 2, 3].includes(p.mes)).map((p) => p.pct_normal ?? 100)
  const pct = Math.round(seco.reduce((a, b) => a + b, 0) / (seco.length || 1))
  const f = lugar.fuentes.power
  return (
    <>
      <p className="titular"><span className="cifra">{pct}<small> %</small></span><span>de la lluvia normal cayó de enero a marzo en los cuatro Niños fuertes: 1982, 1997, 2015 y 2023.</span></p>
      <BarrasLluvia normales={lugar.normales} ninos={lugar.ninos} desde={desde} />
      <div className="leyenda">
        <span><i style={{ background: 'var(--lluvia)' }} />Lluvia normal</span>
        <span><i className="rayado" />En los Niños</span>
        <span><i style={{ background: 'var(--seco)', height: '0.25em' }} />Lo que el sol le saca al suelo</span>
      </div>
      <p className="nota">Es la memoria de tu zona, no un pronóstico.</p>
      {f && <Fuente titulo={`Consultado ${f.consultado}`}>{f.producto}, normales 1991–2020</Fuente>}
    </>
  )
}

function Verdor({ lugar, desde }: { lugar: Lugar; desde: number }) {
  if (!lugar.ndvi) return <Cargando texto="Pidiendo las imágenes MODIS de tu punto. Lo más reciente llega en un par de minutos; los 26 años completos tardan unos 15, y se guardan para la próxima." />
  const u = lugar.ndvi.ultimo
  const f = lugar.fuentes.ndvi
  return (
    <>
      {u && <p className="titular"><span className="cifra">{u.valor.toFixed(2)}</span><span>de verdor (NDVI) el {fecha(u.fecha)}. De 0 a 1: más alto, más verde.</span></p>}
      <NdviMeses meses={lugar.ndvi.meses} desde={desde} />
      {lugar.ndvi.progreso
        ? <p className="nota" role="status">Ya llegaron {lugar.ndvi.n_total} imágenes, las más nuevas primero ({Math.round(100 * lugar.ndvi.progreso[0] / lugar.ndvi.progreso[1])} % de 26 años). El promedio se completa solo.</p>
        : <p className="nota">Promedio de cada mes desde el año 2000, con {lugar.ndvi.n_validos} imágenes sin nubes. Ese píxel de 250 m mezcla techos, calles y árboles: el suelo bajo tu cacao lo ve tu foto, no el satélite.</p>}
      {f && <Fuente titulo={`Consultado ${f.consultado}`}>{f.producto}</Fuente>}
    </>
  )
}
