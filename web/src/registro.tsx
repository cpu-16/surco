import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Comparacion } from './anio'
import { enPanama, local, pedir, sinImagenes, type Expediente, type Ficha, type Lugar, type Resultado } from './api'
import { cambiarIdioma, idioma, L } from './i18n'
import { Cargando, fecha, Icono } from './ui'

/* El registro del patio: la decisión fechada, lo que se fue anotando y la copia de lo que calculó la app.
   Sin cuentas: quien lo crea guarda una clave en su celular; el enlace deja consultar y dejar notas. */

type Nota = Expediente['notas'][number]
type ExpRegistro = Expediente

const CLAVES = 'surco-claves'
export const claveDe = (id?: string) => (id ? local.leer<Record<string, string>>(CLAVES)?.[id] : undefined)
const hoy = () => new Date().toISOString().slice(0, 10)
const MES = (m: string) => { const [a, n] = m.split('-').map(Number); return `${new Date(a, n - 1, 15).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-PA', { month: 'long', year: 'numeric' })}` }

/** Lo que calculó la app, congelado al guardar: el técnico ve lo mismo que vio el productor ese día. */
function resultadoDe(comp: Comparacion | null, lugar: Lugar | null): Resultado | undefined {
  if (!comp) return undefined
  return {
    fecha: hoy(), version: (comp as Comparacion & { version?: string }).version, lectura: comp.lectura,
    estrategias: comp.estrategias.map((e) => ({ id: e.id, nombre: e.nombre, desnudo_cama: e.desnudo_cama, desnudo_arboles: e.desnudo_arboles, deficit_normal_mm: e.agua.deficit_normal_mm, deficit_nino_mm: e.agua.deficit_nino_mm })),
    fuentes: lugar ? Object.values(lugar.fuentes).map((f) => `${f.producto} (${f.celda}), ${L('consultado', 'retrieved')} ${f.consultado}`) : [],
  }
}

/** La línea de tiempo sale de lo que ya está guardado; no hay que llenarla a mano. */
function linea(e: ExpRegistro, nombreCultivo: (c: string) => string, ajeno = false) {
  const items: { fecha: string; texto: string; quien?: string }[] = []
  for (const [c, m] of Object.entries(e.siembras ?? {})) if (m) items.push({ fecha: m, texto: L(`Sembraste ${nombreCultivo(c).toLowerCase()} (${MES(m)})`, `You planted ${nombreCultivo(c).toLowerCase()} (${MES(m)})`) })
  const LUGAR: Record<string, string> = { cama: L('el huerto', 'the garden plot'), perennes: L('debajo de los árboles', 'under the trees'), pina: L('una planta', 'a plant'), general: L('el patio entero', 'the whole yard') }
  for (const f of e.fotos ?? []) {
    const suelo = f.tipo === 'cama' || f.tipo === 'perennes' // las otras son de consulta: lo verde de la foto no es suelo tapado
    items.push({ fecha: f.fecha, texto: suelo ? L(`Foto de ${LUGAR[f.tipo]}: ${f.cobertura} % del suelo tapado por planta verde`, `Photo of ${LUGAR[f.tipo]}: ${f.cobertura}% of the soil covered by green plants`)
      : L(`Foto de ${LUGAR[f.tipo]}${f.descripcion ? `: ${f.descripcion}` : ''}`, `Photo of ${LUGAR[f.tipo]}${f.descripcion ? `: ${f.descripcion}` : ''}`) })
  }
  for (const n of e.notas ?? []) items.push({ fecha: n.fecha.slice(0, 10), texto: n.texto, quien: n.quien === 'tecnico' ? (n.nombre || L('Técnico', 'Advisor')) : ajeno ? L('Productor', 'Grower') : L('Tú', 'You') })
  if (e.resultado) items.push({ fecha: e.resultado.fecha, texto: L('Guardaste la comparación de ese día', 'You saved that day’s comparison') })
  return items.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** La primera revisión, a un mes: lo que se puede comprobar rápido es si el suelo sigue tapado. */
const en30dias = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 7)

/* ---------------- Paso 8: el registro del dueño ---------------- */

export function Registro({ exp, cambiar, comp, lugar, enLinea, nombreCultivo }: {
  exp: ExpRegistro; cambiar: (p: Partial<ExpRegistro>) => void; comp: Comparacion | null; lugar: Lugar | null; enLinea: boolean; nombreCultivo: (c: string) => string
}) {
  const ficha = exp.ficha ?? {}
  const poner = (p: Partial<Ficha>) => cambiar({ ficha: { ...ficha, ...p } })
  const [nota, setNota] = useState('')
  const [estado, setEstado] = useState<'' | 'guardando' | 'listo' | string>('')
  const enlace = exp.id ? `${location.origin}/?e=${exp.id}` : ''
  const mio = !exp.id || !!claveDe(exp.id)
  // las notas que deja el técnico por el enlace viven en el servidor: se traen al abrir el registro
  const traerNotas = () => exp.id && pedir<{ datos: Expediente }>(`/api/expediente/${encodeURIComponent(exp.id)}`).then((r) => {
    const mias = exp.notas ?? [], nuevas = (r.datos.notas ?? []).filter((n) => !mias.some((m) => m.fecha === n.fecha && m.texto === n.texto))
    if (nuevas.length) cambiar({ notas: [...mias, ...nuevas].sort((x, y) => x.fecha.localeCompare(y.fecha)) })
  }).catch(() => { /* sin señal: quedan las de este celular */ })
  useEffect(() => { if (enLinea) traerNotas() }, [exp.id, enLinea]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    setEstado('guardando')
    try {
      const datos = { ...sinImagenes(exp), resultado: resultadoDe(comp, lugar) ?? exp.resultado }
      if (exp.id && mio) {
        const r = await pedir<{ version: number }>(`/api/expediente/${exp.id}`, { method: 'PUT', headers: { 'X-Clave': claveDe(exp.id) ?? '' }, body: JSON.stringify({ datos }) })
        cambiar({ resultado: datos.resultado })
        setEstado(L(`Guardado. Versión ${r.version}.`, `Saved. Version ${r.version}.`))
      } else {
        const r = await pedir<{ id: string; clave: string; version: number }>('/api/expediente', { method: 'POST', body: JSON.stringify({ datos }) })
        local.poner(CLAVES, { ...(local.leer<Record<string, string>>(CLAVES) ?? {}), [r.id]: r.clave })
        cambiar({ id: r.id, resultado: datos.resultado })
        setEstado(L('Guardado. Ya tienes tu enlace.', 'Saved. Your link is ready.'))
      }
    } catch (e) { setEstado(L('No se pudo guardar: ', 'Could not save: ') + (e as Error).message) }
  }
  const anotar = () => {
    const t = nota.trim()
    if (!t) return
    cambiar({ notas: [...(exp.notas ?? []), { quien: 'productor', texto: t, fecha: new Date().toISOString() }] })
    setNota('')
  }
  const compartir = () => navigator.share?.({ title: exp.nombre, url: enlace }).catch(() => { /* cancelado */ }) ?? navigator.clipboard?.writeText(enlace)
  const descargar = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...sinImagenes(exp), resultado: resultadoDe(comp, lugar) ?? exp.resultado }, null, 2)], { type: 'application/json' }))
    a.download = `${(exp.nombre || 'patio').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${hoy()}.json`
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="registro">
      <h2 className="sub">{L('¿Cuál vas a probar?', 'Which one will you try?')}</h2>
      <div className="decision" role="radiogroup" aria-label={L('Lo que decidiste', 'Your decision')}>
        {(comp?.estrategias ?? []).map((e) => (
          <button key={e.id} role="radio" aria-checked={ficha.decision === e.id} className="decision-op" onClick={() => poner({ decision: ficha.decision === e.id ? undefined : e.id, revisar: ficha.revisar || en30dias() })}>
            <span className="marca-op" aria-hidden="true">{ficha.decision === e.id && <motion.span layoutId="op" className="marca-llena" transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} />}</span>
            {e.nombre}
          </button>
        ))}
        {!comp && <Cargando texto={L('Calculando las opciones…', 'Working out the options…')} />}
      </div>
      {ficha.decision && ficha.decision !== 'actual' && <>
        <h2 className="sub">{L('¿Tienes la semilla o las hojas?', 'Do you have the seed or the leaves?')}</h2>
        <div className="chips">
          {([['tengo', L('Sí, las tengo', 'Yes, I have them')], ['conseguir', L('Hay que conseguirlas', 'I need to get them')], ['no hay', L('No hay por aquí', 'None around here')]] as const).map(([k, t]) => (
            <button key={k} className="chip" aria-pressed={ficha.semilla === k} onClick={() => poner({ semilla: ficha.semilla === k ? undefined : k })}>{t}</button>
          ))}
        </div>
        {ficha.semilla === 'no hay' && <p className="nota">{L('Pregúntale al técnico qué hay en tu zona, o prueba con «Tapar con hojas secas», que usa lo que ya cae en tu patio.', 'Ask your advisor what is available where you live, or try “Cover with dry leaves”, which uses what already falls in your yard.')}</p>}
      </>}
      <label className="campo">
        <span>{L('¿Por qué esa?', 'Why that one?')}</span>
        <input value={ficha.motivo ?? ''} onChange={(e) => poner({ motivo: e.target.value })} maxLength={300} placeholder={L('Ej.: tengo semilla de guandú', 'E.g.: I have pigeon pea seed')} />
      </label>
      <label className="campo">
        <span>{L('¿Qué vas a revisar?', 'What will you check?')}</span>
        <input value={ficha.pendiente ?? ''} onChange={(e) => poner({ pendiente: e.target.value })} maxLength={300} placeholder={L('Ej.: si el suelo sigue tapado en un mes', 'E.g.: whether the soil is still covered in a month')} />
      </label>
      <label className="campo en-linea">
        <span>{L('Próxima revisión:', 'Next check:')}</span>
        <input type="month" value={ficha.revisar ?? ''} onChange={(e) => poner({ revisar: e.target.value })} />
      </label>

      <h2 className="sub">{L('Lo que va quedando', 'Your log')}</h2>
      <div className="anotar">
        <input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && anotar()} maxLength={500}
          placeholder={L('Anota algo: «coseché la yuca», «llovió fuerte»…', 'Write something down: “harvested the cassava”, “heavy rain”…')} aria-label={L('Nueva nota', 'New note')} />
        <button className="boton claro" onClick={anotar} disabled={!nota.trim()}>{L('Anotar', 'Add')}</button>
      </div>
      <Linea exp={exp} nombreCultivo={nombreCultivo} />

      <h2 className="sub">{L('Guárdalo y compártelo', 'Save and share it')}</h2>
      <p className="nota">{L(`Con el enlace, tu técnico, la cooperativa ${enPanama(exp) ? 'o el MIDA' : 'o la oficina agrícola de tu zona'} ven tu registro y te pueden dejar notas. Solo tú lo cambias, desde este celular. Las fotos no se suben: solo va su medición.`,
        'With the link, your advisor, co-op or agriculture office can see your record and leave you notes. Only you can change it, from this phone. Photos are not uploaded: only their measurement.')}</p>
      <div className="acciones">
        <button className="boton grande" onClick={guardar} disabled={!enLinea || estado === 'guardando'}><Icono n="compartir" />{estado === 'guardando' ? L('Guardando…', 'Saving…') : exp.id ? L('Guardar los cambios', 'Save changes') : L('Guardar y crear mi enlace', 'Save and get my link')}</button>
      </div>
      {!enLinea && <p className="nota">{L('Sin señal: se guarda en tu celular y lo subes cuando vuelva.', 'Offline: it stays on your phone; upload it when you are back online.')}</p>}
      {estado && estado !== 'guardando' && <p className="nota" role="status">{estado}</p>}
      {enlace && (
        <div className="enlace-caja">
          <a href={enlace} className="enlace-listo">{enlace}</a>
          <button className="boton claro" onClick={compartir}>{L('Enviar', 'Send')}</button>
        </div>
      )}
      <div className="acciones">
        <button className="boton fantasma" onClick={() => print()}>{L('Imprimir o guardar en PDF', 'Print or save as PDF')}</button>
        <button className="boton fantasma" onClick={descargar}>{L('Descargar los datos', 'Download the data')}</button>
      </div>
    </div>
  )
}

function Linea({ exp, nombreCultivo, ajeno }: { exp: ExpRegistro; nombreCultivo: (c: string) => string; ajeno?: boolean }) {
  const items = linea(exp, nombreCultivo, ajeno)
  if (!items.length) return <p className="nota">{L('Todavía no hay nada. Lo que anotes, las fotos y las siembras aparecen aquí con su fecha.', 'Nothing yet. Your notes, photos and planting dates show up here with their date.')}</p>
  return (
    <ol className="linea">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.li key={it.fecha + it.texto} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }}>
            <time dateTime={it.fecha}>{it.fecha.length > 7 ? fecha(it.fecha) : MES(it.fecha)}</time>
            <span>{it.quien && <b>{it.quien}: </b>}{it.texto}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

/* ---------------- El enlace compartido: consultar y anotar ---------------- */

export function VistaRegistro({ id, nombreCultivo }: { id: string; nombreCultivo: (c: string) => string }) {
  const [exp, setExp] = useState<ExpRegistro | null>(null)
  const [error, setError] = useState('')
  const [nota, setNota] = useState('')
  const [quien, setQuien] = useState('')
  useEffect(() => { pedir<{ datos: ExpRegistro }>(`/api/expediente/${encodeURIComponent(id)}`).then((r) => setExp(r.datos)).catch((e) => setError(e.message)) }, [id])
  const anotar = async () => {
    try {
      const r = await pedir<{ notas: Nota[] }>(`/api/expediente/${encodeURIComponent(id)}/nota`, { method: 'POST', body: JSON.stringify({ texto: nota, nombre: quien }) })
      setExp((e) => e && { ...e, notas: r.notas }); setNota('')
    } catch (e) { setError((e as Error).message) }
  }
  if (error) return <p className="aviso" role="alert">{L('No se pudo abrir este registro: ', 'Could not open this record: ')}{error}</p>
  if (!exp) return <Cargando texto={L('Abriendo el registro…', 'Opening the record…')} />
  const r = exp.resultado
  const elegida = r?.estrategias.find((e) => e.id === exp.ficha?.decision)
  return (
    <div className="registro vista">
      <p className="paso-n">{L('Registro compartido', 'Shared record')}</p>
      <h1>{exp.nombre || L('Patio', 'Yard')}</h1>
      <p className="nota">{L(`Cerca de ${exp.lat.toFixed(2)}, ${exp.lon.toFixed(2)} (redondeado a 1 km)`, `Near ${exp.lat.toFixed(2)}, ${exp.lon.toFixed(2)} (rounded to 1 km)`)} · {exp.cultivos.map(nombreCultivo).join(', ')}</p>

      <h2 className="sub">{L('Lo que decidió', 'Their decision')}</h2>
      <p><b>{elegida?.nombre ?? L('Todavía no ha escogido.', 'Not chosen yet.')}</b>{exp.ficha?.motivo && <> {L('Porque:', 'Because:')} {exp.ficha.motivo}</>}</p>
      {exp.ficha?.semilla && <p>{L('Semilla u hojas:', 'Seed or leaves:')} {{ tengo: L('ya las tiene', 'has them'), conseguir: L('hay que conseguirlas', 'needs to get them'), 'no hay': L('no hay por su zona', 'none in the area') }[exp.ficha.semilla]}</p>}
      {exp.ficha?.pendiente && <p>{L('Va a revisar:', 'Will check:')} {exp.ficha.pendiente}{exp.ficha.revisar && ` (${MES(exp.ficha.revisar)})`}</p>}

      {r && (
        <>
          <h2 className="sub">{L(`Lo que calculó la app el ${fecha(r.fecha)}`, `What the app worked out on ${fecha(r.fecha)}`)}</h2>
          {r.lectura.map((t, i) => <p key={i} className={i ? 'nota' : ''}>{t}</p>)}
          <table className="tabla-reg">
            <thead><tr><th>{L('Opción', 'Option')}</th><th>{L('Meses pelado: huerto / árboles', 'Bare months: plot / trees')}</th><th>{L('Agua que falta en la seca', 'Water short in the dry season')}</th></tr></thead>
            <tbody>{r.estrategias.map((e) => <tr key={e.id} data-elegida={e.id === exp.ficha?.decision}><td>{e.nombre}</td><td>{e.desnudo_cama ?? '—'} / {e.desnudo_arboles}</td><td>{e.deficit_normal_mm === null ? L('No aplica', 'N/A') : <>{e.deficit_normal_mm} mm ({L('Niño', 'El Niño')}: {e.deficit_nino_mm})</>}</td></tr>)}</tbody>
          </table>
          <p className="nota">{L('Datos:', 'Data:')} {r.fuentes.join('; ')}.{r.version && ` ${L('Reglas', 'Rules')} ${r.version}.`}</p>
        </>
      )}

      <h2 className="sub">{L('Lo que va quedando', 'Log')}</h2>
      <Linea exp={exp} nombreCultivo={nombreCultivo} ajeno />

      <h2 className="sub">{L('Dejar una nota', 'Leave a note')}</h2>
      <label className="campo"><span>{L('Tu nombre o institución', 'Your name or organization')}</span><input value={quien} onChange={(e) => setQuien(e.target.value)} maxLength={80} placeholder={L('Ej.: Técnico del MIDA, Santiago', 'E.g.: MIDA advisor, Santiago')} /></label>
      <label className="campo"><span>{L('La nota', 'Note')}</span><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={1000} /></label>
      <div className="acciones">
        <button className="boton grande" onClick={anotar} disabled={!nota.trim()}>{L('Dejar la nota', 'Leave the note')}</button>
        <button className="boton fantasma" onClick={() => print()}>{L('Imprimir o guardar en PDF', 'Print or save as PDF')}</button>
      </div>
      <p className="nota pie">{L('Quien deja la nota escribe su nombre; la app no lo verifica. Solo el dueño del patio puede cambiar el registro.', 'Whoever leaves a note types their own name; the app does not verify it. Only the yard owner can change the record.')}</p>
    </div>
  )
}

/** Lo que ve quien abre el enlace en otro celular o computadora: sin pasos, solo el registro. */
export function PaginaCompartida({ id, nombreCultivo }: { id: string; nombreCultivo: (c: string) => string }) {
  return (
    <main className="escena compartida">
      <p className="marca-texto">Surco <button className="enlace" onClick={() => cambiarIdioma(idioma === 'en' ? 'es' : 'en')}>{idioma === 'en' ? 'Español' : 'English'}</button></p>
      <VistaRegistro id={id} nombreCultivo={nombreCultivo} />
    </main>
  )
}
