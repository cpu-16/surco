import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { EJEMPLO, local, pedir, sinImagenes, type Expediente, type Foto, type Lugar, type TipoFoto } from './api'
import { Agua, FOTOS, Fotos, Importa, Patio } from './pasos'
import Cielo from './cielo'
import Anio, { type Comparacion } from './anio'
import { Cargando, Hoja, Icono } from './ui'

const Conversa = lazy(() => import('./pregunta'))

export const NOMBRE = 'Surco'

type Paso = { id: string; corto: string; titulo: string; listo: (e: Expediente) => boolean }
const PASOS: Paso[] = [
  { id: 'patio', corto: 'Tu patio', titulo: '¿Dónde está y qué siembras?', listo: (e) => e.cultivos.length > 0 },
  { id: 'cielo', corto: 'El cielo', titulo: 'Lo que ve la NASA sobre tu patio', listo: () => true },
  { id: 'fotos', corto: 'Tus fotos', titulo: 'El suelo que ves tú', listo: (e) => e.fotos.length >= 2 },
  { id: 'agua', corto: 'El agua', titulo: 'La prueba de la lata', listo: (e) => e.infiltracion_min != null },
  { id: 'importa', corto: 'Lo tuyo', titulo: '¿Qué te importa más?', listo: (e) => e.prioridades.length > 0 },
  { id: 'anio', corto: 'Tu año', titulo: 'Así le iría a tu suelo', listo: () => true },
  { id: 'conversa', corto: 'Conversa', titulo: 'Pregunta o compártelo', listo: () => true },
]
const IDS = PASOS.map((p) => p.id)
// lo que el motor pide → el paso donde se resuelve
const DONDE: Record<string, [number, TipoFoto?]> = { foto_cama: [2, 'cama'], foto_perennes: [2, 'perennes'], infiltracion: [3], parcela: [0], prioridades: [4] }

const L = { exp: 'surco-expediente', lugar: 'surco-lugar', comp: 'surco-comp', vistos: 'surco-vistos', visto: 'surco-bienvenida' }
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
  const [exp, setExp] = useState<Expediente>(() => ({ ...EJEMPLO, ...local.leer<Expediente>(L.exp) }))
  const enLinea = useEnLinea()
  const [error, setError] = useState('')

  /* ---------- navegación: cada paso es una entrada del historial, así el botón Atrás del celular funciona ---------- */
  const [paso, setPaso] = useState(() => { const n = pasoDeHash(); return n >= 0 ? n : local.leer(L.visto) ? 0 : -1 })
  const [dir, setDir] = useState(1)
  const actual = useRef(paso)
  const [subFoto, setSubFoto] = useState(0)
  const [vistos, setVistos] = useState<string[]>(() => local.leer<string[]>(L.vistos) ?? [])
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
  useEffect(() => local.poner(L.vistos, vistos), [vistos])
  const irA = (clave: string) => { const d = DONDE[clave]; if (d) ir(d[0], d[1] ? FOTOS.findIndex((f) => f.tipo === d[1]) : undefined) }

  /* ---------- el expediente vive en el celular ---------- */
  useEffect(() => local.poner(L.exp, exp), [exp])
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
  const [lugar, setLugar] = useState<Lugar | null>(() => { const c = local.leer<CacheLugar>(L.lugar); return cerca(c, exp) ? c!.datos : null })
  const [lugarViejo, setLugarViejo] = useState(false)
  useEffect(() => {
    let vivo = true, t = 0
    const traer = () => pedir<Lugar>(`/api/lugar?lat=${exp.lat}&lon=${exp.lon}`)
      .then((l) => {
        if (!vivo) return
        setLugar(l); setLugarViejo(false); setError('')
        local.poner(L.lugar, { lat: exp.lat, lon: exp.lon, datos: l })
        // AppEEARS tarda horas: no se pregunta cada 15 s por él
        if (l.pendiente.length) t = window.setTimeout(traer, l.pendiente.every((p) => p === 'appeears') ? 120000 : 15000)
      })
      .catch((e) => {
        if (!vivo) return
        const c = local.leer<CacheLugar>(L.lugar)
        if (cerca(c, exp)) { setLugar(c!.datos); setLugarViejo(true) } else setError(e.message)
      })
    traer()
    return () => { vivo = false; clearTimeout(t) }
  }, [exp.lat, exp.lon, enLinea]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- la comparación se recalcula con cada dato de campo; sin señal queda la última ---------- */
  const claveComp = JSON.stringify({ ...sinImagenes(exp), nombre: '', id: '' })
  const [comp, setComp] = useState<Comparacion | null>(() => local.leer<{ clave: string; datos: Comparacion }>(L.comp)?.datos ?? null)
  const [compViejo, setCompViejo] = useState(false)
  useEffect(() => {
    if (!lugar) return
    let vivo = true
    pedir<Comparacion>('/api/comparar', { method: 'POST', body: JSON.stringify({ expediente: sinImagenes(exp) }) })
      .then((c) => { if (!vivo) return; setComp(c); setCompViejo(false); local.poner(L.comp, { clave: claveComp, datos: c }) })
      .catch(() => vivo && setCompViejo(local.leer<{ clave: string }>(L.comp)?.clave !== claveComp))
    return () => { vivo = false }
  }, [claveComp, lugar?.punto.lat, lugar?.punto.lon, enLinea]) // eslint-disable-line react-hooks/exhaustive-deps

  const mesActual = new Date().getMonth() + 1
  const listo = (i: number) => vistos.includes(IDS[i]) && PASOS[i].listo(exp)

  if (paso < 0) return <MotionConfig reducedMotion="user"><Bienvenida empezar={() => { local.poner(L.visto, true); ir(0) }} /></MotionConfig>

  const p = PASOS[paso]
  return (
    <MotionConfig reducedMotion="user">
      <header className="cabecera">
        <div className="cabecera-fila">
          <button className="marca" onClick={() => ir(-1)} aria-label={`${NOMBRE}, volver al inicio`}><Marca />{NOMBRE}</button>
          <AnimatePresence>
            {!enLinea && <motion.span className="sin-senal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>Sin señal</motion.span>}
          </AnimatePresence>
          <span className="espacio" />
          <Instalar />
          <BotonTema />
        </div>
        <nav className="surco" aria-label="Pasos">
          {PASOS.map((x, i) => (
            <button key={x.id} className="terron" data-listo={listo(i)} aria-current={i === paso ? 'step' : undefined} onClick={() => ir(i)}
              aria-label={`Paso ${i + 1}: ${x.corto}${listo(i) ? ', listo' : ''}`}>
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
              <p className="paso-n">Paso {paso + 1} de {PASOS.length}</p>
              <h1 id={`t-${p.id}`} ref={titulo} tabIndex={-1}>{p.titulo}</h1>
            </header>
            {error && !lugar && <p className="aviso" role="alert">No se pudo leer el satélite: {error}</p>}
            {lugarViejo && p.id === 'cielo' && <p className="aviso">Sin señal: son los datos de la última vez.</p>}
            {p.id === 'patio' && <Patio exp={exp} cambiar={cambiar} lugar={lugar} />}
            {p.id === 'cielo' && <Cielo lugar={lugar} desde={mesActual} />}
            {p.id === 'fotos' && <Fotos exp={exp} cambiar={cambiar} sub={subFoto} setSub={setSubFoto} />}
            {p.id === 'agua' && <Agua exp={exp} cambiar={cambiar} />}
            {p.id === 'importa' && <Importa exp={exp} cambiar={cambiar} />}
            {p.id === 'anio' && <Anio comp={comp} desde={mesActual} viejo={compViejo} irA={irA} />}
            {p.id === 'conversa' && <Suspense fallback={<Cargando texto="Abriendo…" />}><Conversa exp={exp} lugar={lugar} comp={comp} cambiar={cambiar} enLinea={enLinea} /></Suspense>}
          </motion.section>
        </AnimatePresence>
      </main>

      <nav className="barra" aria-label="Avanzar">
        <button className="boton fantasma" onClick={() => ir(paso - 1)} disabled={paso === 0}><Icono n="atras" />Atrás</button>
        {paso < PASOS.length - 1 && <button className="boton" onClick={() => ir(paso + 1)}>Seguir: {PASOS[paso + 1].corto}</button>}
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
  const color = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)' }
  return (
    <main className="bienvenida">
      <div className="bienvenida-marca"><Marca t={30} /><span>{NOMBRE}</span></div>
      <div className="bienvenida-tira" aria-hidden="true">
        {AÑO.map((c, i) => (
          <span key={i} className="muestra">
            <motion.span className="tapa" style={{ background: color[c] }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6, delay: 0.5 + i * 0.07 }} />
          </span>
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.15 }}>
        <h1>El año de tu suelo, mes por mes</h1>
        <p>Compara maneras de sembrar tu patio según cuánto tiempo dejan el suelo desnudo. Con datos de la NASA y lo que ves tú.</p>
        <button className="boton grande" onClick={empezar}>Empezar</button>
        <p className="nota">Siete pasos cortos. Funciona sin señal y tus fotos no salen del celular.</p>
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
    <button className="icono-btn" onClick={cambiar} aria-label={efectivo === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
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
      <button className="boton pildora" onClick={tocar}><Icono n="bajar" t={18} />Instalar</button>
      <Hoja abierta={ayuda} cerrar={cerrar} titulo={`Instala ${NOMBRE} en tu celular`}>
        <p>Queda como una app: abre sin la barra del navegador y funciona sin señal.</p>
        <ol className="receta larga">
          {ios
            ? <li><b>iPhone o iPad:</b> toca el botón Compartir (el cuadro con la flecha hacia arriba) y luego «Agregar a inicio».</li>
            : <li><b>Android (Chrome, Brave, Edge):</b> toca el menú ⋮ y luego «Instalar app» o «Agregar a la pantalla principal».</li>}
          <li><b>Samsung Internet:</b> menú ☰, «Agregar página a» y «Pantalla de inicio».</li>
          <li><b>Firefox en Android:</b> menú ⋮ y «Instalar».</li>
          <li><b>Computadora:</b> en Chrome, Edge o Brave, el ícono de instalar a la derecha de la dirección.</li>
        </ol>
      </Hoja>
    </>
  )
}
