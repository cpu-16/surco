import { useCallback, useState } from 'react'
import { motion } from 'motion/react'
import { MESES, MESES_LARGOS, ordenMeses } from './graficos'
import { Cargando, Fuente, Hoja } from './ui'

export type Muestra = { mes: number; cultivo: string | null; nombre: string | null; cobertura: 'alta' | 'media' | 'baja' | 'desnudo'; medido?: boolean }
export type Estrategia = {
  id: string; nombre: string; aplica_a: string; tira: Muestra[]; arboles: Muestra[]; meses_desnudo: number; desnudo_cama: number; desnudo_arboles: number
  n_kg_ha: [number, number] | null
  agua: { demanda_seca_mm: number; deficit_normal_mm: number; deficit_nino_mm: number }
  razon: string; evidencia: { id: string; titulo: string; url: string }[]; plantas?: { nombre: string; cientifico: string }[]
  beneficios: string[]; vacios: string[]; riesgos: string[]; ajustes: string[]
}
export type Comparacion = { estrategias: Estrategia[]; faltan: { clave: string; texto: string; cambia: string }[]; lectura: string[] }

const PASO_DE: Record<string, number> = { parcela: 1, foto_cama: 3, foto_perennes: 3, infiltracion: 4, prioridades: 5 }

export const COLOR = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)', desnudo: 'var(--laterita)' }

export default function Anio({ comp, desde, viejo, irA }: { comp: Comparacion | null; desde: number; viejo: boolean; irA: (clave: string) => void }) {
  const [sel, setSel] = useState<Estrategia | null>(null)
  const [abierta, setAbierta] = useState(false)
  const cerrar = useCallback(() => setAbierta(false), [])
  if (!comp) return <Cargando texto="Calculando el año de tu suelo…" />
  const orden = ordenMeses(desde)
  const total = (e: Estrategia) => e.desnudo_cama + e.desnudo_arboles
  const mejor = Math.min(...comp.estrategias.map(total))
  const hayMejor = comp.estrategias.some((e) => total(e) !== mejor)
  return (
    <>
      {viejo && <p className="aviso">Sin señal: es el cálculo de la última vez. Se pone al día solo cuando vuelva.</p>}
      {comp.lectura.map((l, i) => <p key={i} className={i ? 'lectura-2' : 'lectura'}>{l}</p>)}
      <Leyenda />
      <ul className="estrategias">
        {comp.estrategias.map((e, fila) => (
          <li key={e.id}>
            <button className="estrategia" onClick={() => { setSel(e); setAbierta(true) }} aria-haspopup="dialog">
              <span className="e-cab">
                <span className="e-nombre">{e.nombre}</span>
                {hayMejor && total(e) === mejor && <span className="sello">Menos suelo desnudo</span>}
              </span>
              <Tira etq="Huerto" fila={e.tira} orden={orden} retraso={fila * 0.12} />
              <Tira etq="Árboles" fila={e.arboles} orden={orden} retraso={fila * 0.12 + 0.06} />
              <span className="e-pie">
                <span>Desnudo: <b>{e.desnudo_cama}</b> {e.desnudo_cama === 1 ? 'mes' : 'meses'} el huerto, <b>{e.desnudo_arboles}</b> bajo los árboles</span>
                <span className="ver">Ver por qué</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="meses-eje" aria-hidden="true"><span />{orden.map((m) => <span key={m}>{MESES[m - 1]}</span>)}</div>

      {comp.faltan.length > 0 && (
        <div className="afinar">
          <h2 className="sub">Para afinar el cálculo</h2>
          {comp.faltan.map((f) => (
            <button key={f.clave} className="pendiente" onClick={() => irA(f.clave)} title={f.cambia}>
              <span className="paso-chip">Paso {PASO_DE[f.clave] ?? ''}</span><b>{f.texto}</b>
            </button>
          ))}
        </div>
      )}
      <p className="nota pie">Esto muestra patrones y posibilidades. La decisión es tuya, y conviene revisarla con un técnico del MIDA o del IDIAP.</p>

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
      <span className="tira" role="img" aria-label={`${etq}: ${orden.map((mes) => `${MESES_LARGOS[mes - 1]} ${fila.find((x) => x.mes === mes)?.nombre ?? 'desnudo'}`).join(', ')}`}>
        {orden.map((mes, i) => {
          const m = fila.find((x) => x.mes === mes)!
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
  const items: [keyof typeof COLOR, string][] = [['desnudo', 'Desnudo'], ['baja', 'Poco tapado'], ['media', 'Medio'], ['alta', 'Bien tapado']]
  return (
    <div className="leyenda">
      {items.map(([k, t]) => <span key={k}><i style={{ background: COLOR[k] }} />{t}</span>)}
      <span><i className="medido" />Medido con tu foto</span>
    </div>
  )
}

function Detalle({ e, orden }: { e: Estrategia; orden: number[] }) {
  const [mes, setMes] = useState<number | null>(null)
  const nombre = (fila: Muestra[], m: number) => fila.find((x) => x.mes === m)?.nombre?.toLowerCase() ?? 'suelo desnudo'
  return (
    <div className="detalle">
      <div className="tira grande" role="group" aria-label="Toca un mes">
        {orden.map((m) => {
          const t = e.tira.find((x) => x.mes === m)!
          return (
            <button key={m} className="muestra" aria-pressed={mes === m} style={{ background: COLOR[t.cobertura] }} onClick={() => setMes(mes === m ? null : m)}
              aria-label={`${MESES_LARGOS[m - 1]}: ${nombre(e.tira, m)}`}>{MESES[m - 1]}</button>
          )
        })}
      </div>
      <p className="nota" aria-live="polite">
        {mes ? `En ${MESES_LARGOS[mes - 1]}: el huerto con ${nombre(e.tira, mes)}; debajo de los árboles, ${nombre(e.arboles, mes)}.` : 'Toca un mes para ver qué hay sembrado.'}
      </p>

      <p className="razon">{e.razon}</p>
      {!!e.plantas?.length && (
        <p className="nota plantas">{e.plantas.map((p, i) => <span key={p.cientifico}>{i ? ' · ' : ''}{p.nombre} <i>({p.cientifico})</i></span>)}. Con el nombre científico la encuentras aunque en tu país le digan distinto.</p>
      )}

      <div className="numeros">
        <div><span className="cifra">{e.desnudo_cama + e.desnudo_arboles}</span><span>{e.desnudo_cama + e.desnudo_arboles === 1 ? 'mes' : 'meses'} de suelo desnudo, sumando huerto y árboles</span></div>
        <div><span className="cifra">{e.agua.deficit_normal_mm}<small> mm</small></span><span>de agua que falta en la seca de un año normal</span></div>
        <div><span className="cifra">{e.agua.deficit_nino_mm}<small> mm</small></span><span>si llueve como en los Niños</span></div>
        {e.n_kg_ha && <div><span className="cifra">{e.n_kg_ha[0]}–{e.n_kg_ha[1]}</span><span>kg de nitrógeno por hectárea que dejan las leguminosas</span></div>}
      </div>

      {!!e.ajustes.length && <Bloque titulo="Lo que cambió con tus datos" items={e.ajustes} />}
      <Bloque titulo="Qué le da al suelo" items={e.beneficios} />
      <Bloque titulo="Lo que todavía no se sabe" items={e.vacios} />
      <Bloque titulo="Para revisar con un técnico" items={e.riesgos} />
      <h3>De dónde sale</h3>
      <ul className="fuentes">
        {e.evidencia.map((f) => <li key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></li>)}
      </ul>
      <Fuente>Agua: lluvia efectiva USDA y ET₀ FAO-56 con NASA POWER</Fuente>
    </div>
  )
}

const Bloque = ({ titulo, items }: { titulo: string; items: string[] }) => (
  <>
    <h3>{titulo}</h3>
    <ul>{items.map((b) => <li key={b}>{b}</li>)}</ul>
  </>
)
