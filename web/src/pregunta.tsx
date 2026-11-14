import { useRef, useState } from 'react'
import { pedir, type Expediente, type Lugar } from './api'
import type { Comparacion } from './App'

type Msg = { de: 'tu' | 'surco'; texto: string; fuentes?: string[] }
type Respuesta = { respuesta: string; fuentes: string[]; propuesta?: Partial<Expediente> | null }

// Web Speech API: en Chrome/Brave de Android funciona sin servidor propio
const Reconocer = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition
type SR = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void }

export default function Pregunta({ exp, lugar, comp }: { exp: Expediente; lugar: Lugar | null; comp: Comparacion | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [oyendo, setOyendo] = useState(false)
  const [propuesta, setPropuesta] = useState<Partial<Expediente> | null>(null)
  const sr = useRef<SR | null>(null)

  const enviar = async (t = texto) => {
    if (!t.trim() || ocupado) return
    const historia = [...msgs, { de: 'tu' as const, texto: t }]
    setMsgs(historia); setTexto(''); setOcupado(true)
    try {
      const datos = { ...exp, fotos: exp.fotos.map(({ miniatura: _m, ...f }) => f) }
      const r = await pedir<Respuesta>('/api/ia/pregunta', { method: 'POST', body: JSON.stringify({ historia, expediente: datos, comparacion: comp, lugar: resumenLugar(lugar) }) })
      setMsgs([...historia, { de: 'surco', texto: r.respuesta, fuentes: r.fuentes }])
      if (r.propuesta && Object.keys(r.propuesta).length) setPropuesta(r.propuesta)
    } catch (e) {
      setMsgs([...historia, { de: 'surco', texto: `No pude responder ahora (${(e as Error).message}). Lo que ya está calculado arriba sigue valiendo.` }])
    } finally { setOcupado(false) }
  }

  const hablar = () => {
    if (!Reconocer) return
    if (oyendo) { sr.current?.stop(); return }
    const r = new Reconocer()
    r.lang = 'es-PA'; r.interimResults = false
    r.onresult = (e) => enviar(e.results[0][0].transcript)
    r.onend = () => setOyendo(false); r.onerror = () => setOyendo(false)
    sr.current = r; setOyendo(true); r.start()
  }
  const leer = (t: string) => {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t); u.lang = 'es-419'; speechSynthesis.speak(u)
  }

  return (
    <section className="seccion" aria-labelledby="t-preg" id="pregunta">
      <header><h2 id="t-preg">Pregunta o cuéntale</h2></header>
      <p>Cuéntale de tu patio con tus palabras, o pregunta «¿y si llueve menos?» o «¿por qué no frijol?». Responde con los números de arriba y te dice cuándo no sabe.</p>
      <div aria-live="polite" style={{ display: 'grid', gap: '0.8rem', margin: '1rem 0' }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ justifySelf: m.de === 'tu' ? 'end' : 'start', maxWidth: '90%', background: m.de === 'tu' ? 'var(--papel-2)' : 'transparent', borderLeft: m.de === 'surco' ? '3px solid var(--hoja)' : 0, padding: '0.5rem 0.8rem', borderRadius: 8 }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.texto}</p>
            {m.fuentes?.length ? <p className="nota" style={{ margin: '0.3rem 0 0' }}>Datos: {m.fuentes.join('; ')}</p> : null}
            {m.de === 'surco' && 'speechSynthesis' in window && <button className="fuente" onClick={() => leer(m.texto)}>Escuchar</button>}
          </div>
        ))}
        {ocupado && <p className="nota">Pensando con tus datos…</p>}
      </div>
      {propuesta && (
        <div style={{ background: 'var(--papel-2)', padding: '0.8rem', borderRadius: 10, marginBottom: '0.8rem' }}>
          <p><strong>¿Guardo esto en tu expediente?</strong></p>
          <ul>{Object.entries(propuesta).map(([k, v]) => <li key={k}>{k}: {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}</ul>
          <div className="fila">
            <button className="boton" onClick={() => { window.dispatchEvent(new CustomEvent('surco-propuesta', { detail: propuesta })); setPropuesta(null) }}>Guardar</button>
            <button className="boton claro" onClick={() => setPropuesta(null)}>No, así no es</button>
          </div>
        </div>
      )}
      <form className="fila" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe aquí" aria-label="Tu pregunta" style={{ flex: 1, minWidth: '12em', padding: '0.6em' }} />
        {Reconocer && <button type="button" className="boton claro" onClick={hablar} aria-pressed={oyendo}>{oyendo ? 'Te escucho…' : 'Hablar'}</button>}
        <button className="boton" disabled={ocupado || !texto.trim()}>Enviar</button>
      </form>
    </section>
  )
}

function resumenLugar(l: Lugar | null) {
  if (!l) return null
  return { punto: l.punto, normales: l.normales, ninos: l.ninos.promedio, reciente: l.reciente_imerg ?? { hasta: l.reciente_power.hasta, lluvia_30d: l.reciente_power.lluvia_30d, normal_30d: l.reciente_power.normal_30d },
    ndvi: l.ndvi && { meses: l.ndvi.meses, ultimo: l.ndvi.ultimo }, fuentes: Object.fromEntries(Object.entries(l.fuentes).map(([k, f]) => [k, `${f.producto}, ${f.celda}, consultado ${f.consultado}`])) }
}
