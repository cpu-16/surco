import { Escena, useMes } from './escena'
import { cambiarIdioma, idioma, L } from './i18n'
import { Registro } from './registro'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { EJEMPLO, local, pedir, sinImagenes, type Expediente, type Foto, type Lugar, type TipoFoto } from './api'
import { Agua, FOTOS, Fotos, Importa, nombreDe, Patio } from './pasos'
import Cielo from './cielo'
import Anio, { type Comparacion } from './anio'
import { Cargando, Hoja, Icono } from './ui'

const Conversa = lazy(() => import('./pregunta'))

export const NOMBRE = 'Surco'

type Paso = { id: string; corto: string; titulo: string; listo: (e: Expediente) => boolean }
const PASOS: Paso[] = [
  { id: 'patio', corto: L('Tu patio', "Your plot"), titulo: L('¿Dónde está y qué siembras?', "Where is it and what do you grow?"), listo: (e) => e.cultivos.length > 0 },
  { id: 'cielo', corto: L('El cielo', "The sky"), titulo: L('Lo que ve la NASA sobre tu patio', "What NASA sees above your plot"), listo: () => true },
  { id: 'fotos', corto: L('Tus fotos', "Your photos"), titulo: L('El suelo que ves tú', "The soil you see"), listo: (e) => e.fotos.length >= 2 },
  { id: 'agua', corto: L('El agua', "Water"), titulo: L('¿El agua entra o se queda arriba?', "Does water soak in or stay on top?"), listo: (e) => e.infiltracion_min != null || !!e.charcos },
  { id: 'importa', corto: L('Lo tuyo', "Your needs"), titulo: L('¿Qué te importa más?', "What matters most to you?"), listo: (e) => e.prioridades.length > 0 },
  { id: 'anio', corto: L('Tu año', "Your year"), titulo: L('Así le iría a tu suelo', "How your soil could do"), listo: () => true },
  { id: 'conversa', corto: L('Conversa', "Chat"), titulo: L('Pregunta o compártelo', "Ask or share"), listo: () => true },
  { id: 'registro', corto: L('Registro', 'Record'), titulo: L('Tu registro del patio', 'Your yard record'), listo: (e) => !!e.id },
]
const IDS = PASOS.map((p) => p.id)
// lo que el motor pide → el paso donde se resuelve
const DONDE: Record<string, [number, TipoFoto?]> = { foto_cama: [2, 'cama'], foto_perennes: [2, 'perennes'], infiltracion: [3], parcela: [0], prioridades: [4] }

const LLAVES = { exp: 'surco-expediente', lugar: 'surco-lugar', comp: 'surco-comp', vistos: 'surco-vistos', visto: 'surco-bienvenida' }
type CacheLugar = { lat: number; lon: number; datos: Lugar }
const cerca = (c: CacheLugar | null, e: Expediente) => !!c && Math.abs(c.lat - e.lat) < 0.005 && Math.abs(c.lon - e.lon) < 0.005

function useEnLinea() {
  const [v, setV] = useState(navigator.onLine)
  useEffect(() => {
    const si = () => setV(true), no = () => setV(false)
    addEventListener('online', si); addEventListener('offline', no)
    return () => { removeEventListener('online', si); removeEventListener('offline', no) }
  }, [])
  return v
}

const pasoDeHash = () => IDS.indexOf(location.hash.slice(1))

export default function App() {
  const [exp, setExp] = useState<Expediente>(() => ({ ...EJEMPLO, ...local.leer<Expediente>(LLAVES.exp) }))
  const enLinea = useEnLinea()
  const [error, setError] = useState('')

  /* ---------- navegación: cada paso es una entrada del historial, así el botón Atrás del celular funciona ---------- */
  const [paso, setPaso] = useState(() => { const n = pasoDeHash(); return n >= 0 ? n : local.leer(LLAVES.visto) ? 0 : -1 })
  const [dir, setDir] = useState(1)
  const actual = useRef(paso)
  const [subFoto, setSubFoto] = useState(0)
  const [vistos, setVistos] = useState<string[]>(() => local.leer<string[]>(LLAVES.vistos) ?? [])
  const titulo = useRef<HTMLHeadingElement>(null)

  const mover = useCallback((n: number) => {
    setDir(n >= actual.current ? 1 : -1)
    actual.current = n
    setPaso(n)
    window.scrollTo({ top: 0 })
  }, [])
  const ir = useCallback((n: number, sub?: number) => {
    if (sub != null) setSubFoto(sub)
    if (n === actual.current) return
    history.pushState(null, '', n < 0 ? location.pathname + location.search : `#${IDS[n]}`)
    mover(n)
  }, [mover])
  useEffect(() => {
    if (paso === 0 && !location.hash) history.replaceState(null, '', '#patio')
    const f = () => mover(pasoDeHash())
    addEventListener('popstate', f)
    return () => removeEventListener('popstate', f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mover])
  useEffect(() => {
    if (paso < 0) return
    setVistos((v) => v.includes(IDS[paso]) ? v : [...v, IDS[paso]])
    titulo.current?.focus({ preventScroll: true })
  }, [paso])
  useEffect(() => local.poner(LLAVES.vistos, vistos), [vistos])
  const irA = (clave: string) => { const d = DONDE[clave]; if (d) ir(d[0], d[1] ? FOTOS.findIndex((f) => f.tipo === d[1]) : undefined) }

  /* ---------- el expediente vive en el celular ---------- */
  useEffect(() => local.poner(LLAVES.exp, exp), [exp])
  const cambiar = useCallback((p: Partial<Expediente>) => setExp((e) => ({ ...e, ...p })), [])

  useEffect(() => {
    const f = (ev: Event) => {
      const { tipo, extra } = (ev as CustomEvent<{ tipo: TipoFoto; extra: Partial<Foto> }>).detail
      setExp((e) => ({ ...e, fotos: e.fotos.map((x) => x.tipo === tipo ? { ...x, ...extra, hojarasca: x.hojarasca ?? extra.hojarasca } : x) }))
    }
    addEventListener('surco-foto', f)
    return () => removeEventListener('surco-foto', f)
  }, [])

  // enlace compartido: el técnico abre el mismo patio
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('e')
    if (id && id !== exp.id) pedir<{ datos: Expediente }>(`/api/expediente/${encodeURIComponent(id)}`).then((r) => setExp({ ...EJEMPLO, ...r.datos, id })).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- satélite: lo último que llegó se guarda y se muestra sin señal ---------- */
  const [lugar, setLugar] = useState<Lugar | null>(() => { const c = local.leer<CacheLugar>(LLAVES.lugar); return cerca(c, exp) ? c!.datos : null })
  const [lugarViejo, setLugarViejo] = useState(false)
  useEffect(() => {
    let vivo = true, t = 0
    const traer = () => pedir<Lugar>(`/api/lugar?lat=${exp.lat}&lon=${exp.lon}`)
      .then((l) => {
        if (!vivo) return
        setLugar(l); setLugarViejo(false); setError('')
        local.poner(LLAVES.lugar, { lat: exp.lat, lon: exp.lon, datos: l })
        // AppEEARS tarda horas: no se pregunta cada 15 s por él
        if (l.pendiente.length) t = window.setTimeout(traer, l.pendiente.every((p) => p === 'appeears') ? 120000 : 15000)
      })
      .catch((e) => {
        if (!vivo) return
        const c = local.leer<CacheLugar>(LLAVES.lugar)
        if (cerca(c, exp)) { setLugar(c!.datos); setLugarViejo(true) } else setError(e.message)
      })
    traer()
    return () => { vivo = false; clearTimeout(t) }
  }, [exp.lat, exp.lon, enLinea]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- la comparación se recalcula con cada dato de campo; sin señal queda la última ---------- */
  const claveComp = JSON.stringify({ ...sinImagenes(exp), nombre: '', id: '' })
  const [comp, setComp] = useState<Comparacion | null>(() => local.leer<{ clave: string; datos: Comparacion }>(LLAVES.comp)?.datos ?? null)
  const [compViejo, setCompViejo] = useState(false)
  useEffect(() => {
    if (!lugar) return
    let vivo = true
    pedir<Comparacion>('/api/comparar', { method: 'POST', body: JSON.stringify({ expediente: sinImagenes(exp), lang: idioma }) })
      .then((c) => { if (!vivo) return; setComp(c); setCompViejo(false); local.poner(LLAVES.comp, { clave: claveComp, datos: c }) })
      .catch(() => vivo && setCompViejo(local.leer<{ clave: string }>(LLAVES.comp)?.clave !== claveComp))
    return () => { vivo = false }
  }, [claveComp, lugar?.punto.lat, lugar?.punto.lon, enLinea]) // eslint-disable-line react-hooks/exhaustive-deps

  const mesActual = new Date().getMonth() + 1
  const listo = (i: number) => vistos.includes(IDS[i]) && PASOS[i].listo(exp)

  if (paso < 0) return <MotionConfig reducedMotion="user"><Bienvenida empezar={() => { local.poner(LLAVES.visto, true); ir(0) }} /></MotionConfig>

  const p = PASOS[paso]
  return (
    <MotionConfig reducedMotion="user">
      <header className="cabecera">
        <div className="cabecera-fila">
          <button className="marca" onClick={() => ir(-1)} aria-label={L(`${NOMBRE}, volver al inicio`, `${NOMBRE}, back to start`)}><Marca />{NOMBRE}</button>
          <AnimatePresence>
            {!enLinea && <motion.span className="sin-senal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>{L("Sin señal", "Offline")}</motion.span>}
          </AnimatePresence>
          <span className="espacio" />
          <Instalar />
          <button className="icono-btn idioma" onClick={() => cambiarIdioma(idioma === 'en' ? 'es' : 'en')} aria-label={L('Switch to English', 'Cambiar a español')}>{idioma === 'en' ? 'ES' : 'EN'}</button>
          <BotonTema />
        </div>
        <nav className="surco" aria-label={L("Pasos", "Steps")}>
          {PASOS.map((x, i) => (
            <button key={x.id} className="terron" data-listo={listo(i)} aria-current={i === paso ? 'step' : undefined} onClick={() => ir(i)}
              aria-label={L(`Paso ${i + 1}: ${x.corto}${listo(i) ? ', listo' : ''}`, `Step ${i + 1}: ${x.corto}${listo(i) ? ', done' : ''}`)}>
              <motion.span className="tapa" initial={false} animate={{ scaleY: listo(i) ? 1 : 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }} />
              <span className="num">{listo(i) ? <Icono n="brote" t={14} /> : i + 1}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="escena">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.section key={p.id} className="paso" custom={dir} aria-labelledby={`t-${p.id}`}
            variants={{ entra: (d: number) => ({ x: d * 56, opacity: 0 }), centro: { x: 0, opacity: 1 }, sale: (d: number) => ({ x: d * -56, opacity: 0 }) }}
            initial="entra" animate="centro" exit="sale" transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>
            <header className="paso-cab">
              <p className="paso-n">{L(<>Paso {paso + 1} de {PASOS.length}</>, <>Step {paso + 1} of {PASOS.length}</>)}</p>
              <h1 id={`t-${p.id}`} ref={titulo} tabIndex={-1}>{p.titulo}</h1>
            </header>
            {error && !lugar && <p className="aviso" role="alert">{L(<>No se pudo leer el satélite: {error}</>, <>Could not load satellite data: {error}</>)}</p>}
            {lugarViejo && p.id === 'cielo' && <p className="aviso">{L("Sin señal: son los datos de la última vez.", "Offline: these are the last saved data.")}</p>}
            {p.id === 'patio' && <Patio exp={exp} cambiar={cambiar} lugar={lugar} />}
            {p.id === 'cielo' && <Cielo lugar={lugar} desde={mesActual} />}
            {p.id === 'fotos' && <Fotos exp={exp} cambiar={cambiar} sub={subFoto} setSub={setSubFoto} />}
            {p.id === 'agua' && <Agua exp={exp} cambiar={cambiar} />}
            {p.id === 'importa' && <Importa exp={exp} cambiar={cambiar} />}
            {p.id === 'anio' && <Anio comp={comp} desde={mesActual} viejo={compViejo} irA={irA} />}
            {p.id === 'conversa' && <Suspense fallback={<Cargando texto={L("Abriendo…", "Opening…")} />}><Conversa exp={exp} lugar={lugar} comp={comp} cambiar={cambiar} enLinea={enLinea} /></Suspense>}
            {p.id === 'registro' && <Registro exp={exp} cambiar={cambiar} comp={comp} lugar={lugar} enLinea={enLinea} nombreCultivo={nombreDe} />}
          </motion.section>
        </AnimatePresence>
      </main>

      <nav className="barra" aria-label={L("Avanzar", "Move forward")}>
        <button className="boton fantasma" onClick={() => ir(paso - 1)} disabled={paso === 0}><Icono n="atras" />{L("Atrás", "Back")}</button>
        {paso < PASOS.length - 1 && <button className="boton" onClick={() => ir(paso + 1)}>{L(<>Seguir: {PASOS[paso + 1].corto}</>, <>Next: {PASOS[paso + 1].corto}</>)}</button>}
      </nav>
    </MotionConfig>
  )
}

/** La marca: la tabla de colores del suelo, de laterita a hoja. */
function Marca({ t = 22 }: { t?: number }) {
  const c = ['#a04b2c', '#c4a46a', '#8fae55', '#c4a46a', '#8fae55', '#3d7638', '#8fae55', '#3d7638', '#3d7638']
  return (
    <svg width={t} height={t} viewBox="0 0 30 30" aria-hidden="true">
      {c.map((f, i) => <rect key={i} x={1 + (i % 3) * 9.7} y={1 + Math.floor(i / 3) * 9.7} width="8.6" height="8.6" rx="1.4" fill={f} />)}
    </svg>
  )
}

/** Primera vez: un año de suelo que se va cubriendo, mes por mes. Es toda la idea en un segundo. */
const AÑO = ['alta', 'alta', 'media', 'baja', 'alta', 'alta', 'alta', 'media', 'media', 'alta', 'alta', 'media'] as const
function Bienvenida({ empezar }: { empezar: () => void }) {
  const mes = useMes()
  const color = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)' }
  return (
    <main className="bienvenida">
      <div className="bienvenida-marca"><Marca t={30} /><span>{NOMBRE}</span></div>
      <Escena mes={mes} />
      <div className="bienvenida-tira" aria-hidden="true">
        {AÑO.map((c, i) => (
          <span key={i} className="muestra" data-actual={i === mes}>
            <motion.span className="tapa" style={{ background: color[c] }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6, delay: 0.5 + i * 0.07 }} />
          </span>
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.15 }}>
        <h1>{L("El año de tu suelo, mes por mes", "Your soil through the year, month by month")}</h1>
        <p>{L("Compara maneras de sembrar tu patio según cuánto tiempo dejan el suelo desnudo. Con datos de la NASA y lo que ves tú.", "Compare ways to plant your plot by how long they leave the soil bare. Using NASA data and what you see.")}</p>
        <button className="boton grande" onClick={empezar}>{L("Empezar", "Start")}</button>
        <p className="nota">{L("Ocho pasos cortos. Funciona sin señal. La foto se mide en tu celular; con señal, el asistente la mira para describirla y no se guarda.", "Eight short steps. Works offline. Photos are measured on your phone; when online, the assistant looks at them to describe them, and they are not stored.")}</p>
      </motion.div>
    </main>
  )
}

/* ---------- tema claro y oscuro; el cambio se abre en círculo desde el botón ---------- */
const FONDO = { light: '#eef0e7', dark: '#151812' }
function BotonTema() {
  const [tema, setTema] = useState<'light' | 'dark' | null>(() => { const t = local.leer<string>('surco-tema'); return t === 'light' || t === 'dark' ? t : null })
  const efectivo = tema ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const cambiar = (ev: MouseEvent) => {
    const nuevo = efectivo === 'dark' ? 'light' : 'dark'
    const aplicar = () => {
      document.documentElement.dataset.theme = nuevo
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', FONDO[nuevo]))
      local.poner('surco-tema', nuevo); setTema(nuevo)
    }
    const d = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (!d.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return aplicar()
    const x = ev.clientX, y = ev.clientY, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    d.startViewTransition(() => flushSync(aplicar)).ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' },
    )).catch(() => { /* la transición se saltó */ })
  }
  return (
    <button className="icono-btn" onClick={cambiar} aria-label={efectivo === 'dark' ? L('Cambiar a modo claro', "Switch to light mode") : L('Cambiar a modo oscuro', "Switch to dark mode")}>
      <Icono n={efectivo === 'dark' ? 'sol' : 'luna'} />
    </button>
  )
}

/* ---------- instalar: el aviso del navegador si existe; si no, cómo hacerlo en cada uno ---------- */
type AvisoInstalar = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
function Instalar() {
  const [aviso, setAviso] = useState<AvisoInstalar | null>(null)
  const [ayuda, setAyuda] = useState(false)
  const [instalada, setInstalada] = useState(() => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  const cerrar = useCallback(() => setAyuda(false), [])
  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setAviso(e as AvisoInstalar) }
    const g = () => setInstalada(true)
    addEventListener('beforeinstallprompt', f); addEventListener('appinstalled', g)
    return () => { removeEventListener('beforeinstallprompt', f); removeEventListener('appinstalled', g) }
  }, [])
  if (instalada) return null
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const tocar = async () => {
    if (!aviso) return setAyuda(true)
    await aviso.prompt()
    if ((await aviso.userChoice).outcome === 'accepted') setInstalada(true)
    setAviso(null)
  }
  return (
    <>
      <button className="boton pildora" onClick={tocar}><Icono n="bajar" t={18} />{L("Instalar", "Install")}</button>
      <Hoja abierta={ayuda} cerrar={cerrar} titulo={L(`Instala ${NOMBRE} en tu celular`, `Install ${NOMBRE} on your phone`)}>
        <p>{L("Queda como una app: abre sin la barra del navegador y funciona sin señal.", "Works like an app: opens without the browser bar and works offline.")}</p>
        <ol className="receta larga">
          {ios
            ? <li>{L(<><b>iPhone o iPad:</b> toca el botón Compartir (el cuadro con la flecha hacia arriba) y luego «Agregar a inicio».</>, <><b>iPhone or iPad:</b> tap Share (the square with an upward arrow), then “Add to Home Screen”.</>)}</li>
            : <li>{L(<><b>Android (Chrome, Brave, Edge):</b> toca el menú ⋮ y luego «Instalar app» o «Agregar a la pantalla principal».</>, <><b>Android (Chrome, Brave, Edge):</b> tap the ⋮ menu, then “Install app” or “Add to Home screen”.</>)}</li>}
          <li>{L(<><b>Samsung Internet:</b> menú ☰, «Agregar página a» y «Pantalla de inicio».</>, <><b>Samsung Internet:</b> ☰ menu, “Add page to”, then “Home screen”.</>)}</li>
          <li>{L(<><b>Firefox en Android:</b> menú ⋮ y «Instalar».</>, <><b>Firefox on Android:</b> ⋮ menu, then “Install”.</>)}</li>
          <li>{L(<><b>Computadora:</b> en Chrome, Edge o Brave, el ícono de instalar a la derecha de la dirección.</>, <><b>Computer:</b> in Chrome, Edge or Brave, use the install icon to the right of the address.</>)}</li>
        </ol>
      </Hoja>
    </>
  )
}
