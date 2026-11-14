import { useCallback, useState } from 'react'
import { motion } from 'motion/react'
import { MESES, MESES_LARGOS, ordenMeses } from './graficos'
import { Cargando, Fuente, Hoja } from './ui'
import { L } from './i18n'

export type Muestra = { mes: number; cultivo: string | null; nombre: string | null; cobertura: 'alta' | 'media' | 'baja' | 'desnudo'; medido?: boolean }
export type Estrategia = {
  id: string; nombre: string; aplica_a: string; tira: Muestra[]; arboles: Muestra[]; meses_desnudo: number; desnudo_cama: number | null; desnudo_arboles: number
  n_kg_ha: [number, number] | null
  comida_meses?: number | null; labores?: { siembras: number; tapar_hojas: number; cortes: number }
  n_por_planta?: { nombre: string; kg_ha: [number, number] }[]
  agua: { demanda_seca_mm: number | null; deficit_normal_mm: number | null; deficit_nino_mm: number | null }
  razon: string; evidencia: { id: string; titulo: string; url: string }[]; plantas?: { nombre: string; cientifico: string | null }[]
  beneficios: string[]; vacios: string[]; riesgos: string[]; ajustes: string[]
}
export type Comparacion = { estrategias: Estrategia[]; faltan: { clave: string; texto: string; cambia: string }[]; lectura: string[]; temporada?: { meses_secos: number[] } }

const PASO_DE: Record<string, number> = { parcela: 1, foto_cama: 3, foto_perennes: 3, infiltracion: 4, prioridades: 5 }

export const COLOR = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)', desnudo: 'var(--laterita)' }

export default function Anio({ comp, desde, viejo, irA, enLinea }: { comp: Comparacion | null; desde: number; viejo: boolean; irA: (clave: string) => void; enLinea: boolean }) {
  const [sel, setSel] = useState<Estrategia | null>(null)
  const [abierta, setAbierta] = useState(false)
  const cerrar = useCallback(() => setAbierta(false), [])
  if (!comp && !enLinea) return <p className="aviso">{L('Sin señal y todavía no hay un cálculo para este patio. Se hace solo cuando vuelva la señal.', 'Offline, and there is no calculation for this plot yet. It runs by itself when the signal comes back.')}</p>
  if (!comp) return <Cargando texto={L('Calculando el año de tu suelo…', 'Working out your soil’s year…')} />
  const orden = ordenMeses(desde)
  const total = (e: Estrategia) => (e.desnudo_cama ?? 0) + e.desnudo_arboles
  const mejor = Math.min(...comp.estrategias.map(total))
  const hayMejor = comp.estrategias.some((e) => total(e) !== mejor)
  return (
    <>
      {viejo && <p className="aviso">{L('Sin señal: es el cálculo de la última vez. Se pone al día solo cuando vuelva.', 'Offline: this is the last calculation. It updates by itself when the signal comes back.')}</p>}
      {comp.lectura.map((l, i) => <p key={i} className={i ? 'lectura-2' : 'lectura'}>{l}</p>)}
      <Leyenda />
      <ul className="estrategias">
        {comp.estrategias.map((e, fila) => (
          <li key={e.id}>
            <button className="estrategia" onClick={() => { setSel(e); setAbierta(true) }} aria-haspopup="dialog">
              <span className="e-cab">
                <span className="e-nombre">{e.nombre}</span>
                {hayMejor && total(e) === mejor && <span className="sello">{L('Menos suelo desnudo', 'Least bare soil')}</span>}
              </span>
              {e.tira.length > 0 && <Tira etq={L('Huerto', 'Garden plot')} fila={e.tira} orden={orden} retraso={fila * 0.12} />}
              {e.arboles.length > 0 && <Tira etq={L('Árboles', 'Trees')} fila={e.arboles} orden={orden} retraso={fila * 0.12 + 0.06} />}
              <span className="e-pie">
                <span>{e.desnudo_cama === null && !e.arboles.length ? L('Sin cálculo para estos cultivos', 'No calculation for these crops') : L(<>Desnudo: {e.desnudo_cama !== null && <><b>{e.desnudo_cama}</b> {e.desnudo_cama === 1 ? 'mes' : 'meses'} el huerto</>}{e.desnudo_cama !== null && e.arboles.length > 0 && ', '}{e.arboles.length > 0 && <><b>{e.desnudo_arboles}</b> bajo los árboles</>}</>,
                  <>Bare: {e.desnudo_cama !== null && <><b>{e.desnudo_cama}</b> {e.desnudo_cama === 1 ? 'month' : 'months'} in the garden plot</>}{e.desnudo_cama !== null && e.arboles.length > 0 && ', '}{e.arboles.length > 0 && <><b>{e.desnudo_arboles}</b> under the trees</>}</>)}</span>
                <span className="ver">{L('Ver por qué', 'See why')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="meses-eje" aria-hidden="true"><span />{orden.map((m) => <span key={m}>{MESES[m - 1]}</span>)}</div>

      {comp.faltan.length > 0 && (
        <div className="afinar">
          <h2 className="sub">{L('Para afinar el cálculo', 'To make the numbers more exact')}</h2>
          {comp.faltan.map((f) => (
            <button key={f.clave} className="pendiente" onClick={() => irA(f.clave)} title={f.cambia}>
              <span className="paso-chip">{L('Paso', 'Step')} {PASO_DE[f.clave] ?? ''}</span><b>{f.texto}</b>
            </button>
          ))}
        </div>
      )}
      <p className="nota pie">{L('Esto muestra patrones y posibilidades. La decisión es tuya, y conviene revisarla con un técnico agrícola de tu zona (en Panamá, el MIDA o el IDIAP).', 'This shows patterns and possibilities. The decision is yours, and it is worth going over it with a local farm advisor or extension officer.')}</p>

      <Hoja abierta={abierta} cerrar={cerrar} titulo={sel?.nombre ?? ''}>
        {sel && <Detalle e={sel} orden={orden} />}
      </Hoja>
    </>
  )
}

function Tira({ etq, fila, orden, retraso }: { etq: string; fila: Muestra[]; orden: number[]; retraso: number }) {
  return (
    <span className="fila-tira">
      <span className="etq">{etq}</span>
      <span className="tira" role="img" aria-label={`${etq}: ${orden.map((mes) => `${MESES_LARGOS[mes - 1]} ${fila.find((x) => x.mes === mes)?.nombre ?? L('desnudo', 'bare')}`).join(', ')}`}>
        {orden.map((mes, i) => {
          const m = fila.find((x) => x.mes === mes)
          if (!m) return <span key={mes} className="muestra" />
          return (
            <motion.span key={mes} className="muestra" data-medido={m.medido ? 1 : 0} style={{ background: COLOR[m.cobertura] }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', bounce: 0.25, duration: 0.4, delay: retraso + i * 0.028 }}>
            </motion.span>
          )
        })}
      </span>
    </span>
  )
}

function Leyenda() {
  const items: [keyof typeof COLOR, string][] = [['desnudo', L('Desnudo', 'Bare')], ['baja', L('Poco tapado', 'Barely covered')], ['media', L('Medio', 'Half covered')], ['alta', L('Bien tapado', 'Well covered')]]
  return (
    <div className="leyenda">
      {items.map(([k, t]) => <span key={k}><i style={{ background: COLOR[k] }} />{t}</span>)}
      <span><i className="medido" />{L('Medido con tu foto', 'Measured from your photo')}</span>
    </div>
  )
}

function Detalle({ e, orden }: { e: Estrategia; orden: number[] }) {
  const [mes, setMes] = useState<number | null>(null)
  const nombre = (fila: Muestra[], m: number) => fila.find((x) => x.mes === m)?.nombre?.toLowerCase() ?? L('suelo desnudo', 'bare soil')
  return (
    <div className="detalle">
      {e.tira.length > 0 && <div className="tira grande" role="group" aria-label={L('Toca un mes', 'Tap a month')}>
        {orden.map((m) => {
          const t = e.tira.find((x) => x.mes === m)
          if (!t) return <span key={m} className="muestra" />
          return (
            <button key={m} className="muestra" aria-pressed={mes === m} style={{ background: COLOR[t.cobertura] }} onClick={() => setMes(mes === m ? null : m)}
              aria-label={`${MESES_LARGOS[m - 1]}: ${nombre(e.tira, m)}`}>{MESES[m - 1]}</button>
          )
        })}
      </div>}
      <p className="nota" aria-live="polite">
        {mes ? L(`En ${MESES_LARGOS[mes - 1]}: el huerto con ${nombre(e.tira, mes)}${e.arboles.length ? `; debajo de los árboles, ${nombre(e.arboles, mes)}` : ''}.`,
          `In ${MESES_LARGOS[mes - 1]}: the garden plot has ${nombre(e.tira, mes)}${e.arboles.length ? `; under the trees, ${nombre(e.arboles, mes)}` : ''}.`)
          : e.tira.length ? L('Toca un mes para ver qué hay sembrado.', 'Tap a month to see what is planted.') : ''}
      </p>

      <p className="razon">{e.razon}</p>
      {!!e.plantas?.length && (
        <p className="nota plantas">{e.plantas.map((p, i) => <span key={p.cientifico ?? p.nombre}>{i ? ' · ' : ''}{p.nombre}{p.cientifico && <> <i>({p.cientifico})</i></>}</span>)}{L('. Con el nombre científico la encuentras aunque en tu país le digan distinto.', '. With the scientific name you can find it even if people where you live call it something else.')}</p>
      )}

      <div className="numeros">
        {e.desnudo_cama !== null && <div><span className="cifra">{e.desnudo_cama}</span><span>{L(`${e.desnudo_cama === 1 ? 'mes' : 'meses'} con el huerto pelado`, `${e.desnudo_cama === 1 ? 'month' : 'months'} with the garden plot bare`)}</span></div>}
        {e.arboles.length > 0 && <div><span className="cifra">{e.desnudo_arboles}</span><span>{L(`${e.desnudo_arboles === 1 ? 'mes' : 'meses'} con el suelo pelado bajo los árboles`, `${e.desnudo_arboles === 1 ? 'month' : 'months'} with bare soil under the trees`)}</span></div>}
        {e.agua.deficit_normal_mm !== null && <>
          <div><span className="cifra">{e.agua.deficit_normal_mm}<small> mm</small></span><span>{L('de agua que le falta al huerto en la seca de un año normal', 'of water the garden plot is short in the dry season of a normal year')}</span></div>
          <div><span className="cifra">{e.agua.deficit_nino_mm}<small> mm</small></span><span>{L('si llueve como en los Niños', 'if it rains like in the El Niño years')}</span></div>
        </>}
      </div>
      {e.labores && <p className="nota">{L(<>Trabajo en el año: <b>{e.labores.siembras}</b> {e.labores.siembras === 1 ? 'siembra' : 'siembras'}, <b>{e.labores.tapar_hojas}</b> {e.labores.tapar_hojas === 1 ? 'tapada' : 'tapadas'} con hojas y <b>{e.labores.cortes}</b> {e.labores.cortes === 1 ? 'corte' : 'cortes'}.</>,
        <>Work in the year: <b>{e.labores.siembras}</b> {e.labores.siembras === 1 ? 'planting' : 'plantings'}, <b>{e.labores.tapar_hojas}</b> leaf {e.labores.tapar_hojas === 1 ? 'mulching' : 'mulchings'} and <b>{e.labores.cortes}</b> {e.labores.cortes === 1 ? 'cut' : 'cuts'}.</>)}
        {e.comida_meses != null && L(<> Primera cosecha que se come: en <b>{e.comida_meses}</b> {e.comida_meses === 1 ? 'mes' : 'meses'}.</>, <> First harvest you can eat: in <b>{e.comida_meses}</b> {e.comida_meses === 1 ? 'month' : 'months'}.</>)}</p>}
      {e.agua.deficit_normal_mm !== null && <p className="nota">{L('1 mm es 1 litro por cada metro cuadrado de huerto. Cuenta solo las camas de ciclo corto: no los árboles, ni tu riego, ni el agua que ahorran las hojas.', '1 mm is 1 litre for each square metre of garden plot. It counts only the short-cycle beds: not the trees, your watering, or the water the leaves save.')}</p>}
      {!!e.n_por_planta?.length && (
        <p className="nota">{L('Nitrógeno que puede dejar cada planta según estudios de otros lugares (kg por hectárea, no medido en tu patio): ', 'Nitrogen each plant can leave, from studies elsewhere (kg per hectare, not measured in your yard): ')}
          {e.n_por_planta.map((n) => `${n.nombre} ${n.kg_ha[0]}–${n.kg_ha[1]}`).join('; ')}.</p>
      )}

      {!!e.ajustes.length && <Bloque titulo={L('Lo que cambió con tus datos', 'What changed with your data')} items={e.ajustes} />}
      <Bloque titulo={L('Qué le da al suelo', 'What it gives the soil')} items={e.beneficios} />
      <Bloque titulo={L('Lo que todavía no se sabe', 'What we don’t know yet')} items={e.vacios} />
      <Bloque titulo={L('Para revisar con un técnico', 'To check with a farm technician')} items={e.riesgos} />
      <h3>{L('De dónde sale', 'Where this comes from')}</h3>
      <ul className="fuentes">
        {e.evidencia.map((f) => <li key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></li>)}
      </ul>
      <Fuente>{L('Agua: lluvia efectiva USDA y ET₀ FAO-56 con NASA POWER', 'Water: USDA effective rainfall and FAO-56 ET₀ with NASA POWER')}</Fuente>
    </div>
  )
}

const Bloque = ({ titulo, items }: { titulo: string; items: string[] }) => (
  <>
    <h3>{titulo}</h3>
    <ul>{items.map((b) => <li key={b}>{b}</li>)}</ul>
  </>
)
