import { idioma, L } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { pedir, sinImagenes, type Expediente, type Lugar } from './api'
import type { Comparacion } from './anio'
import { Icono } from './ui'

type Msg = { de: 'tu' | 'surco'; texto: string; fuentes?: string[] }
type Respuesta = { respuesta: string; fuentes: string[]; propuesta?: Partial<Expediente> | null }

// Web Speech API: en Chrome/Brave de Android funciona sin servidor propio
type SR = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void }
const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
const Reconocer = w.SpeechRecognition ?? w.webkitSpeechRecognition

const SUGERENCIAS = L(['¿Qué siembro primero?', '¿Y si llueve menos este verano?', '¿Con qué tapo el suelo?', '¿Por qué mis plantas no crecen?'],
  ['What do I plant first?', 'What if it rains less this dry season?', 'What can I cover the soil with?', 'Why aren’t my plants growing?'])
/** País del celular (es-PA → PA) para que la conversación use las palabras de allá. */
const region = () => { try { return new Intl.Locale(navigator.language).region ?? 'PA' } catch { return 'PA' } }

const NOMBRES: Record<string, string> = {
  cultivos: L('Cultivos', 'Crops'), siembras: L('Siembras', 'Planting dates'), riego: L('Riego', 'Watering'), prioridades: L('Lo que te importa', 'What matters to you'),
  infiltracion_min: L('Minutos de la lata', 'Minutes in the can test'), charcos: L('Charcos después de un aguacero', 'Puddles after heavy rain'),
}
/** Valores de la propuesta (claves internas) dichos en inglés; en español se muestran tal cual llegan. */
const VALORES_EN: Record<string, string> = {
  si: 'yes', no: 'no', nose: 'I haven’t checked', 'a veces': 'sometimes',
  agua: 'use less water', suelo: 'better soil', comida: 'food for the home', venta: 'something to sell', trabajo: 'less work',
  yuca: 'cassava', pina: 'pineapple', platano: 'plantain', cacao: 'cocoa (cacao)', naranja: 'orange', toronja: 'grapefruit',
  maiz: 'corn', frijol: 'beans', guandu: 'pigeon pea', otoe: 'taro (otoe)', name: 'yam', zapallo: 'squash',
}
const valor = (x: unknown) => L(x, VALORES_EN[String(x)] ?? x)

export default function Conversa({ exp, lugar, comp, cambiar, enLinea }: {
  exp: Expediente; lugar: Lugar | null; comp: Comparacion | null; cambiar: (p: Partial<Expediente>) => void; enLinea: boolean
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [oyendo, setOyendo] = useState(false)
  const [propuesta, setPropuesta] = useState<Partial<Expediente> | null>(null)
  const sr = useRef<SR | null>(null)
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length, ocupado])

  const enviar = async (t = texto) => {
    if (!t.trim() || ocupado || !enLinea) return
    const historia = [...msgs, { de: 'tu' as const, texto: t }]
    setMsgs(historia); setTexto(''); setOcupado(true)
    try {
      const r = await pedir<Respuesta>('/api/ia/pregunta', { method: 'POST', body: JSON.stringify({ historia, expediente: { ...sinImagenes(exp), pais: region() }, comparacion: comp, lugar: resumenLugar(lugar), lang: idioma }) })
      setMsgs([...historia, { de: 'surco', texto: r.respuesta, fuentes: r.fuentes }])
      if (r.propuesta && Object.keys(r.propuesta).length) setPropuesta(r.propuesta)
    } catch (e) {
      setMsgs([...historia, { de: 'surco', texto: L(`No pude responder ahora (${(e as Error).message}). Lo que ya está calculado sigue valiendo.`, `I couldn’t answer right now (${(e as Error).message}). What is already calculated still holds.`) }])
    } finally { setOcupado(false) }
  }

  const hablar = () => {
    if (!Reconocer) return
    if (oyendo) { sr.current?.stop(); return }
    const r = new Reconocer()
    r.lang = idioma === 'en' ? 'en-US' : 'es-PA'; r.interimResults = false
    r.onresult = (e) => enviar(e.results[0][0].transcript)
    r.onend = () => setOyendo(false); r.onerror = () => setOyendo(false)
    sr.current = r; setOyendo(true); r.start()
  }
  const leer = (t: string) => {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t); u.lang = idioma === 'en' ? 'en-US' : 'es-PA'; speechSynthesis.speak(u)
  }

  return (
    <>
      <div className="chat" aria-live="polite">
        {!msgs.length && <p className="nota">{L('Cuéntale de tu patio con tus palabras o pregunta. Responde con los números de los pasos anteriores y te dice cuando no sabe.', 'Tell it about your yard in your own words, or ask a question. It answers with the numbers from the earlier steps and tells you when it doesn’t know.')}</p>}
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} className={`burbuja ${m.de}`} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
              <p>{m.texto}</p>
              {m.fuentes?.length ? <small className="nota">{L('Datos:', 'Data:')} {m.fuentes.join('; ')}</small> : null}
              {m.de === 'surco' && 'speechSynthesis' in window && <button className="enlace" onClick={() => leer(m.texto)}><Icono n="altavoz" t={16} />{L('Escuchar', 'Listen')}</button>}
            </motion.div>
          ))}
        </AnimatePresence>
        {ocupado && <div className="burbuja surco pensando" aria-label={L('Pensando', 'Thinking')}><span /><span /><span /></div>}
        <div ref={fin} />
      </div>

      {!msgs.length && (
        <div className="chips sugerencias">
          {SUGERENCIAS.map((s) => <button key={s} className="chip" onClick={() => enviar(s)} disabled={!enLinea}>{s}</button>)}
        </div>
      )}

      {propuesta && (
        <div className="propuesta">
          <p><b>{L('¿Guardo esto en tu patio?', 'Save this to your yard?')}</b></p>
          <ul>{Object.entries(propuesta).map(([k, v]) => <li key={k}>{NOMBRES[k] ?? k}: {Array.isArray(v) ? v.map(valor).join(', ') : typeof v === 'object' && v ? Object.entries(v).map(([a, b]) => `${valor(a)} ${b}`).join(', ') : String(valor(v))}</li>)}</ul>
          <div className="acciones">
            <button className="boton" onClick={() => {
              cambiar({ ...propuesta, siembras: { ...exp.siembras, ...(propuesta.siembras ?? {}) } }); setPropuesta(null)
            }}>{L('Guardar', 'Save')}</button>
            <button className="boton fantasma" onClick={() => setPropuesta(null)}>{L('No, así no es', 'No, that’s not right')}</button>
          </div>
        </div>
      )}

      <form className="escribir" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={enLinea ? L('Escribe aquí', 'Type here') : L('Sin señal: vuelve cuando haya', 'Offline: come back when you have signal')} aria-label={L('Tu pregunta', 'Your question')} disabled={!enLinea} />
        {Reconocer && <button type="button" className="icono-btn" onClick={hablar} aria-pressed={oyendo} aria-label={oyendo ? L('Te escucho, toca para parar', 'I’m listening, tap to stop') : L('Hablar', 'Speak')} disabled={!enLinea}><Icono n="mic" /></button>}
        <button className="icono-btn lleno" disabled={ocupado || !texto.trim() || !enLinea} aria-label={L('Enviar', 'Send')}><Icono n="enviar" /></button>
      </form>

    </>
  )
}


function resumenLugar(l: Lugar | null) {
  if (!l) return null
  return {
    punto: l.punto, normales: l.normales, ninos: l.ninos.promedio,
    reciente: l.reciente_imerg ? { ...l.reciente_imerg, dias: l.reciente_imerg.dias.slice(-14) } : { hasta: l.reciente_power.hasta, lluvia_30d: l.reciente_power.lluvia_30d, normal_30d: l.reciente_power.normal_30d },
    ndvi: l.ndvi && { meses: l.ndvi.meses, ultimo: l.ndvi.ultimo },
    fuentes: Object.fromEntries(Object.entries(l.fuentes).map(([k, f]) => [k, `${f.producto}, ${f.celda}, consultado ${f.consultado}`])),
  }
}
