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
  detalle?: string; razon: string; evidencia: { id: string; titulo: string; url: string }[]; plantas?: { nombre: string; cientifico: string | null }[]
  beneficios: string[]; vacios: string[]; riesgos: string[]; ajustes: string[]
}
export type Comparacion = { estrategias: Estrategia[]; faltan: { clave: string; texto: string; cambia: string }[]; lectura: string[]; temporada?: { meses_secos: number[] } }


export const COLOR = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)', desnudo: 'var(--laterita)' }

// nombre corto para escoger con qué comparar; el largo va en la hoja de detalle
const CORTO: Record<string, () => string> = { tapar: () => L('Hojas secas', 'Dry leaves'), rotar: () => L('Rotar cultivos', 'Rotate crops'), viva: () => L('Cobertura viva', 'Living cover') }
const corto = (e: Estrategia) => CORTO[e.id]?.() ?? e.nombre

export default function Anio({ comp, desde, viejo, irA, enLinea, panama }: { comp: Comparacion | null; desde: number; viejo: boolean; irA: (clave: string) => void; enLinea: boolean; panama: boolean }) {
  const [elegida, setElegida] = useState<string | null>(null)
  const [abierta, setAbierta] = useState(false)
  const cerrar = useCallback(() => setAbierta(false), [])
  if (!comp && !enLinea) return <p className="aviso">{L('Sin señal y todavía no hay un cálculo para este patio. Se hace solo cuando vuelva la señal.', 'Offline, and there is no calculation for this plot yet. It runs by itself when the signal comes back.')}</p>
  if (!comp) return <Cargando texto={L('Calculando el año de tu suelo…', 'Working out your soil’s year…')} />
  const orden = ordenMeses(desde)
  const total = (e: Estrategia) => (e.desnudo_cama ?? 0) + e.desnudo_arboles
  const actual: Estrategia | undefined = comp.estrategias.find((e) => e.id === 'actual') ?? comp.estrategias[0]
  const otras = comp.estrategias.filter((e) => e !== actual)
  // por defecto: la que menos suelo pelado deja y, entre esas, la que menos trabajo da
  const trabajo = (e: Estrategia) => e.labores ? e.labores.siembras + e.labores.tapar_hojas + e.labores.cortes : 99
  const facil = [...otras].sort((a, b) => total(a) - total(b) || trabajo(a) - trabajo(b))[0] as Estrategia | undefined
  const sel = otras.find((e) => e.id === elegida) ?? facil
  const meses = (n: number) => L(n === 1 ? 'mes' : 'meses', n === 1 ? 'month' : 'months')
  const huerto = (e: Estrategia) => e.tira.length > 0 && e.desnudo_cama !== null
  if (!actual) return <p className="aviso">{L('No hay cálculo para estos cultivos.', 'No calculation for these crops.')}</p>
  return (
    <>
      {viejo && <p className="aviso">{L('Sin señal: es el cálculo de la última vez. Se pone al día solo cuando vuelva.', 'Offline: this is the last calculation. It updates by itself when the signal comes back.')}</p>}

      <section className="respuesta">
        <p className="r-titulo">{total(actual) ? L('Hoy tu suelo queda pelado', 'Today your soil is left bare') : L('Hoy tu suelo no queda pelado ningún mes', 'Today your soil is never left bare')}</p>
        {total(actual) > 0 && <ul className="r-cifras">
          {huerto(actual) && <li><b>{actual.desnudo_cama}</b> {L(`${meses(actual.desnudo_cama!)} en el huerto`, `${meses(actual.desnudo_cama!)} in the garden plot`)}</li>}
          {actual.arboles.length > 0 && <li><b>{actual.desnudo_arboles}</b> {L(`${meses(actual.desnudo_arboles)} bajo los árboles`, `${meses(actual.desnudo_arboles)} under the trees`)}</li>}
        </ul>}
        {actual.detalle && <p className="r-hoy">{L('Hoy:', 'Today:')} {actual.detalle}. <button className="enlace" onClick={() => irA('parcela')}>{L('¿Siembras otra cosa? Cámbialo', 'Grow something else? Change it')}</button></p>}

        {sel && <>
          <p className="r-pregunta">{L('Compáralo con', 'Compare it with')}</p>
          <div className="opciones" role="radiogroup" aria-label={L('Compáralo con', 'Compare it with')}>
            {otras.map((e) => <button key={e.id} className="chip" role="radio" aria-checked={e === sel} onClick={() => setElegida(e.id)}>{corto(e)}</button>)}
          </div>
          <div className="antes-despues">
            <span className="meses-eje" aria-hidden="true"><span />{orden.map((m) => <span key={m}>{MESES[m - 1]}</span>)}</span>
            {huerto(actual) && sel.tira.length > 0 && <>
              <p className="ad-zona">{L('Huerto', 'Garden plot')}</p>
              <Tira etq={L('Hoy', 'Today')} fila={actual.tira} orden={orden} retraso={0} />
              <Tira etq={corto(sel)} fila={sel.tira} orden={orden} retraso={0.1} key={'h' + sel.id} />
            </>}
            {actual.arboles.length > 0 && sel.arboles.length > 0 && <>
              <p className="ad-zona">{L('Bajo los árboles', 'Under the trees')}</p>
              <Tira etq={L('Hoy', 'Today')} fila={actual.arboles} orden={orden} retraso={0.2} />
              <Tira etq={corto(sel)} fila={sel.arboles} orden={orden} retraso={0.3} key={'a' + sel.id} />
            </>}
          </div>
          <Leyenda />
          <p className="r-facil">{total(sel) >= total(actual)
            ? L('No deja menos suelo pelado que lo que haces hoy.', 'It does not leave less bare soil than what you do today.')
            : total(sel) === 0 ? L(<>Así <b>ningún mes</b> queda pelado.</>, <>That way it is <b>never</b> bare.</>)
            : L(<>Así queda pelado <b>{total(sel)}</b> {meses(total(sel))}.</>, <>That way it is bare <b>{total(sel)}</b> {meses(total(sel))}.</>)}
            {sel === facil && total(sel) < total(actual) && L(' Es la que menos trabajo da.', ' It is the least work.')}</p>
          <button className="boton claro" onClick={() => setAbierta(true)} aria-haspopup="dialog">{L('Cómo se hace', 'How to do it')}</button>
        </>}
      </section>

      {comp.faltan.length > 0 && (
        <div className="afinar">
          <p className="r-pregunta">{L('Para afinarlo', 'To make it more exact')}</p>
          <div className="opciones">{comp.faltan.map((f) => <button key={f.clave} className="chip" onClick={() => irA(f.clave)} title={f.cambia}>{f.texto}</button>)}</div>
        </div>
      )}
      <details className="como">
        <summary>{L('Cómo lo calculé', 'How I worked it out')}</summary>
        {comp.lectura.map((l, i) => <p key={i} className="nota">{l}</p>)}
      </details>
      <p className="nota pie">{L(`La decisión es tuya; revísala con un técnico${panama ? ' del MIDA o el IDIAP' : ' agrícola de tu zona'}.`, 'The decision is yours; go over it with a local farm advisor.')}</p>

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
  const items: [keyof typeof COLOR, string][] = [['desnudo', L('Desnudo', 'Bare')], ['baja', L('Hojas secas o poco tapado', 'Dry leaves or barely covered')], ['media', L('Medio', 'Half covered')], ['alta', L('Bien tapado', 'Well covered')]]
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
