import { lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Lugar } from './api'
import { BarrasLluvia, MESES_LARGOS, NdviMeses, Reciente } from './graficos'
import { Cargando, fecha, Fuente, rango } from './ui'
import { L } from './i18n'

const Mapa = lazy(() => import('./mapa'))

/** De dónde sale cada dato, en palabras. El nombre técnico del producto queda en el título (al tocar o pasar el mouse). */
const FUENTE: Record<string, string> = {
  power: L('NASA POWER: clima de cada día, en un cuadro de 55 km', 'NASA POWER: daily weather, over a 55 km square'),
  imerg: L('Satélite GPM de la NASA: lluvia de cada día, en un cuadro de 10 km', 'NASA’s GPM satellite: daily rain, over a 10 km square'),
  ndvi: L('Satélite MODIS de la NASA: verdor, en un cuadro de 250 m', 'NASA’s MODIS satellite: greenness, over a 250 m square'),
}

/** El número de verdor dicho en palabras. */
const verdor = (v: number) => v >= 0.7 ? L('Muy verde', 'Very green') : v >= 0.5 ? L('Verde', 'Green') : v >= 0.3 ? L('Poco verde', 'A little green') : L('Casi sin plantas', 'Almost no plants')

const PESTANAS = [['lluvia', L('Lluvia', 'Rain')], ['nino', L('El Niño', 'El Niño')], ['verdor', L('Verdor', 'Greenness')], ['pixeles', L('Mapa', 'Map')]] as const
type Pestana = (typeof PESTANAS)[number][0]

export default function Cielo({ lugar, desde }: { lugar: Lugar | null; desde: number }) {
  const [tab, setTab] = useState<Pestana>('lluvia')
  if (!lugar) return <Cargando texto={L('Leyendo 45 años de clima de la NASA para tu punto…', 'Reading 45 years of NASA weather for your spot…')} />
  return (
    <>
      <div className="segmentos" role="tablist" aria-label={L('Datos de la NASA', 'NASA data')}>
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
        <p className="titular"><span className="cifra">{lugar.reciente_power.lluvia_30d}<small> mm</small></span><span>{L(<>de lluvia en 30 días, hasta el {fecha(lugar.reciente_power.hasta)}</>, <>of rain in 30 days, up to {fecha(lugar.reciente_power.hasta)}</>)}</span></p>
      )}
      <Reciente dias={dias} />
      <p className="nota">
        {im ? L(`En los últimos 30 días cayeron ${im.lluvia_30d} mm en tu zona.`, `In the last 30 days, ${im.lluvia_30d} mm of rain fell in your area.`)
          : L('La lluvia diaria del satélite GPM está en camino; esto es NASA POWER, que reparte la lluvia en 55 km.', 'Daily rain from the GPM satellite is on its way; this is NASA POWER, which spreads the rain over 55 km.')}
      </p>
      {f && <Fuente titulo={L(`${f.producto}, consultado ${f.consultado}`, `${f.producto}, checked ${f.consultado}`)}>{FUENTE[im ? 'imerg' : 'power']}</Fuente>}
    </>
  )
}

function Racha({ im }: { im: NonNullable<Lugar['reciente_imerg']> }) {
  if (im.racha_seca_dias >= 2)
    return <p className="titular"><span className="cifra">{im.racha_seca_dias}<small>{L(' días', ' days')}</small></span><span>{L(<>sin llover, hasta el {fecha(im.hasta)}</>, <>with no rain, up to {fecha(im.hasta)}</>)}</span></p>
  const r = im.ultima_racha
  if (r) {
    const despues = im.dias.filter((d) => d.fecha > r.hasta).reduce((a, d) => a + (d.lluvia ?? 0), 0)
    return (
      <p className="titular"><span className="cifra">{r.dias}<small>{L(' días', ' days')}</small></span>
        <span>{L(<>sin llover, {rango(r.desde, r.hasta)}.{despues > 0 ? ` Después cayeron ${Math.round(despues * 10) / 10} mm.` : ''}</>,
          <>with no rain, {rango(r.desde, r.hasta)}.{despues > 0 ? ` Then ${Math.round(despues * 10) / 10} mm fell.` : ''}</>)}</span></p>
    )
  }
  return <p className="titular"><span className="cifra">{im.lluvia_30d}<small> mm</small></span><span>{L('en 30 días. Ha llovido casi todos los días.', 'in 30 days. It has rained almost every day.')}</span></p>
}

/** Meses secos del lugar con la misma regla del motor (lluvia < la mitad de la ET₀); sin seca, los 3 más secos. */
const mesesSecos = (n: Lugar['normales']) => {
  const secos = n.filter((x) => x.lluvia < 0.5 * x.et0).map((x) => x.mes)
  return secos.length ? secos : [...n].sort((a, b) => a.lluvia - b.lluvia).slice(0, 3).map((x) => x.mes).sort((a, b) => a - b)
}
/** «de diciembre a marzo» si van seguidos (aunque crucen el año); si no, la lista. */
const periodo = (ms: number[]) => {
  const hay = new Set(ms), antes = (m: number) => (m + 10) % 12 + 1
  const inicios = ms.filter((m) => !hay.has(antes(m)))
  if (inicios.length !== 1 || ms.length < 2) return L('en ', 'in ') + lista(ms.map((m) => MESES_LARGOS[m - 1]))
  const ultimo = ms.find((m) => !hay.has(m % 12 + 1))!
  return L(`de ${MESES_LARGOS[inicios[0] - 1]} a ${MESES_LARGOS[ultimo - 1]}`, `from ${MESES_LARGOS[inicios[0] - 1]} to ${MESES_LARGOS[ultimo - 1]}`)
}
const lista = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${L('y', 'and')} ${xs[xs.length - 1]}`

function Nino({ lugar, desde }: { lugar: Lugar; desde: number }) {
  const meses = mesesSecos(lugar.normales)
  const seco = lugar.ninos.promedio.filter((p) => meses.includes(p.mes)).map((p) => p.pct_normal ?? 100)
  const pct = Math.round(seco.reduce((a, b) => a + b, 0) / (seco.length || 1))
  const f = lugar.fuentes.power
  return (
    <>
      <p className="titular"><span className="cifra">{pct}<small> %</small></span><span>{L(`de la lluvia normal cayó ${periodo(meses)}, tus meses secos, en los cuatro Niños fuertes: 1982, 1997, 2015 y 2023.`, `of the normal rain fell ${periodo(meses)}, your dry months, in the four strong El Niño years: 1982, 1997, 2015 and 2023.`)}</span></p>
      <BarrasLluvia normales={lugar.normales} ninos={lugar.ninos} desde={desde} />
      <div className="leyenda">
        <span><i style={{ background: 'var(--lluvia)' }} />{L('Lluvia normal', 'Normal rain')}</span>
        <span><i className="rayado" />{L('En los Niños', 'In El Niño years')}</span>
        <span><i style={{ background: 'var(--seco)', height: '0.25em' }} />{L('Lo que el sol le saca al suelo', 'What the sun pulls out of the soil')}</span>
      </div>
      <p className="nota">{L('Es la memoria de tu zona, no un pronóstico.', 'This is what your area remembers, not a forecast.')}</p>
      {f && <Fuente titulo={L(`${f.producto}, normales 1991–2020, consultado ${f.consultado}`, `${f.producto}, 1991–2020 normals, checked ${f.consultado}`)}>{FUENTE.power}</Fuente>}
    </>
  )
}

function Verdor({ lugar, desde }: { lugar: Lugar; desde: number }) {
  if (!lugar.ndvi) return <Cargando texto={L('Pidiendo las imágenes MODIS de tu punto. Lo más reciente llega en un par de minutos; los 26 años completos tardan unos 15, y se guardan para la próxima.', 'Asking for the MODIS images of your spot. The newest ones arrive in a couple of minutes; all 26 years take about 15, and they are saved for next time.')} />
  const u = lugar.ndvi.ultimo
  const f = lugar.fuentes.ndvi
  return (
    <>
      {u && <p className="titular"><span className="cifra palabra">{verdor(u.valor)}</span><span>{L(<>se veía tu zona desde el satélite el {fecha(u.fecha)}.</>, <>is how your area looked from the satellite on {fecha(u.fecha)}.</>)}</span></p>}
      <NdviMeses meses={lugar.ndvi.meses} desde={desde} />
      {lugar.ndvi.progreso
        ? <p className="nota" role="status">{L(<>Ya llegaron {lugar.ndvi.n_total} imágenes, las más nuevas primero ({Math.round(100 * lugar.ndvi.progreso[0] / lugar.ndvi.progreso[1])} % de 26 años). El promedio se completa solo.</>,
          <>{lugar.ndvi.n_total} images are in, newest first ({Math.round(100 * lugar.ndvi.progreso[0] / lugar.ndvi.progreso[1])} % of 26 years). The average fills in by itself.</>)}</p>
        : <p className="nota">{L(<>Así cambia el verdor de tu zona en el año: baja en la época seca y sube con las lluvias. Es el promedio de {lugar.ndvi.n_validos} fotos del satélite sin nubes, desde el año 2000. El satélite ve un cuadro de 250 m con techos, calles y árboles; el suelo debajo de tus plantas lo ve tu foto.</>,
          <>This is how your area’s greenness changes through the year: it drops in the dry season and comes back with the rainy season. It is the average of {lugar.ndvi.n_validos} cloud-free satellite photos since 2000. The satellite sees a 250 m square with roofs, streets and trees; the soil under your plants is seen by your photo.</>)}</p>}
      {f && <Fuente titulo={L(`${f.producto}, consultado ${f.consultado}`, `${f.producto}, checked ${f.consultado}`)}>{FUENTE.ndvi}</Fuente>}
    </>
  )
}
