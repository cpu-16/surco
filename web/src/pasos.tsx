import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { local, type Expediente, type Foto, type Lugar, type TipoFoto } from './api'
import { medir } from './canopeo'
import { GuiaLata } from './guia'
import { Fuente, Hoja, Icono } from './ui'

type Props = { exp: Expediente; cambiar: (p: Partial<Expediente>) => void }

export const CULTIVOS: [string, string][] = [
  ['yuca', 'Yuca'], ['pina', 'Piña'], ['platano', 'Plátano'], ['cacao', 'Cacao'], ['naranja', 'Naranja'], ['toronja', 'Toronja'],
  ['maiz', 'Maíz'], ['frijol', 'Frijol'], ['guandu', 'Guandú'], ['otoe', 'Otoe'], ['name', 'Ñame'], ['zapallo', 'Zapallo'],
]

/** Los que duran años: no se les pregunta la fecha de siembra. */
const ARBOLES = new Set(['cacao', 'naranja', 'toronja', 'platano', 'mango', 'aguacate', 'limón', 'limon', 'coco', 'guanábana', 'café', 'cafe', 'marañón', 'nance'])
const nombreDe = (c: string) => CULTIVOS.find(([k]) => k === c)?.[1] ?? c[0].toUpperCase() + c.slice(1)

/* ---------------- Paso 1: el patio ---------------- */

export function Patio({ exp, cambiar, lugar }: Props & { lugar: Lugar | null }) {
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')
  const alternar = (v: string) => cambiar({ cultivos: exp.cultivos.includes(v) ? exp.cultivos.filter((x) => x !== v) : [...exp.cultivos, v] })
  const [otro, setOtro] = useState('')
  const propios = exp.cultivos.filter((c) => !CULTIVOS.some(([k]) => k === c))
  const cortos = exp.cultivos.filter((c) => !ARBOLES.has(c))
  const agregar = (e: FormEvent) => {
    e.preventDefault()
    const v = otro.trim().toLowerCase()
    if (v && !exp.cultivos.includes(v)) cambiar({ cultivos: [...exp.cultivos, v] })
    setOtro('')
  }
  const ubicar = () => {
    if (!navigator.geolocation) return setAviso('Este navegador no da la ubicación.')
    setBuscando(true); setAviso('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setBuscando(false); cambiar({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }) },
      () => { setBuscando(false); setAviso('No se pudo leer la ubicación. Revisa el permiso del navegador.') },
      { enableHighAccuracy: false, timeout: 15000 },
    )
  }
  return (
    <>
      <div className="lugar">
        <div className="lugar-dato">
          <span className="cifra">{lugar ? Math.round(lugar.punto.elevacion_m) : '…'}<small> m</small></span>
          <span className="nota">sobre el mar</span>
        </div>
        <div className="lugar-texto">
          <p><strong>Cerca de {exp.lat.toFixed(2)}, {exp.lon.toFixed(2)}</strong></p>
          <p className="nota">Redondeado a 1 km. Tu casa exacta no sale del celular.</p>
        </div>
        <button className="boton claro lugar-boton" onClick={ubicar} disabled={buscando}><Icono n="ubicar" />{buscando ? 'Buscando…' : 'Usar mi ubicación'}</button>
        {aviso && <p className="nota alerta lugar-boton" role="alert">{aviso}</p>}
      </div>

      <h2 className="sub">¿Qué tienes sembrado?</h2>
      <div className="chips">
        {CULTIVOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.cultivos.includes(k)} onClick={() => alternar(k)}>{n}</button>)}
        <AnimatePresence initial={false}>
          {propios.map((c) => (
            <motion.button key={c} className="chip" aria-pressed="true" onClick={() => alternar(c)} aria-label={`Quitar ${c}`}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}>
              {c[0].toUpperCase() + c.slice(1)}<Icono n="cerrar" t={14} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <form className="otro" onSubmit={agregar}>
        <input value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={40} enterKeyHint="done"
          placeholder="¿Otro? Ej.: ají, mango, culantro" aria-label="Escribe otro cultivo" />
        <button className="boton claro" disabled={!otro.trim()}>Agregar</button>
      </form>

      {cortos.length > 0 && (
        <fieldset className="campo siembra">
          <legend>¿Cuándo los sembraste?</legend>
          {cortos.map((c) => (
            <Siembra key={c} nombre={nombreDe(c)} valor={exp.siembras[c] ?? ''} poner={(v) => cambiar({ siembras: { ...exp.siembras, [c]: v } })} />
          ))}
          <small className="nota">Los árboles no hacen falta.{exp.cultivos.includes('yuca') && !exp.siembras.yuca ? ' Si no pones la yuca, calculo como si fuera en mayo.' : ''}</small>
        </fieldset>
      )}
      <label className="campo">
        <span>Nombre del patio</span>
        <input value={exp.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
      </label>
    </>
  )
}

const MESES_N = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Mes y año con dos listas: más claro que el selector de fecha en cualquier celular. */
function Siembra({ nombre, valor, poner }: { nombre: string; valor: string; poner: (v: string) => void }) {
  const hoy = new Date()
  const [a, m] = valor ? valor.split('-').map(Number) : [0, 0]
  const anos = [hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2, hoy.getFullYear() - 3]
  const fijar = (na: number, nm: number) => poner(na && nm ? `${na}-${String(nm).padStart(2, '0')}` : '')
  return (
    <div className="fila-siembra">
      <span>{nombre}</span>
      <select aria-label={`Mes en que sembraste ${nombre}`} value={m || ''} onChange={(e) => fijar(a || anos[0], Number(e.target.value))}>
        <option value="">Mes</option>
        {MESES_N.map((n, i) => <option key={n} value={i + 1}>{n[0].toUpperCase() + n.slice(1)}</option>)}
      </select>
      <select aria-label={`Año en que sembraste ${nombre}`} value={a || ''} onChange={(e) => fijar(Number(e.target.value), m || 5)}>
        <option value="">Año</option>
        {anos.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

/* ---------------- Paso 3: las fotos, una por una ---------------- */

export const FOTOS: { tipo: TipoFoto; corto: string; titulo: string; como: string }[] = [
  { tipo: 'cama', corto: 'El huerto', titulo: 'El suelo del huerto (yuca, piña…)', como: 'De pie, con el celular a la altura del pecho, mirando hacia abajo.' },
  { tipo: 'perennes', corto: 'Bajo los árboles', titulo: 'El suelo debajo del cacao o los cítricos', como: 'Igual, pero debajo de la copa. El satélite no puede ver esto.' },
  { tipo: 'pina', corto: 'Una piña', titulo: 'Una piña completa', como: 'La planta entera con su base, para ver cómo está.' },
  { tipo: 'general', corto: 'El patio', titulo: 'El patio entero', como: 'Desde una esquina, para ver si hay pendiente.' },
]

/** En el celular la cámara abre directo; en la computadora solo tiene sentido elegir una foto guardada. */
const TACTIL = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export function Fotos({ exp, cambiar, sub, setSub }: Props & { sub: number; setSub: (n: number) => void }) {
  const [midiendo, setMidiendo] = useState(false)
  const [nueva, setNueva] = useState<string | null>(null) // la foto recién medida hace el barrido una vez
  const [dir, setDir] = useState(1)
  const f = FOTOS[sub]
  const foto = exp.fotos.find((x) => x.tipo === f.tipo)
  const irSub = (n: number) => { setDir(n > sub ? 1 : -1); setSub(n) }

  const tomar = async (archivo?: File) => {
    if (!archivo) return
    setMidiendo(true)
    try {
      const r = await medir(archivo)
      const nuevaFoto: Foto = { id: crypto.randomUUID(), tipo: f.tipo, fecha: new Date().toISOString().slice(0, 10), cobertura: r.cobertura, miniatura: r.miniatura, mascara: r.mascara }
      cambiar({ fotos: [...exp.fotos.filter((x) => x.tipo !== f.tipo), nuevaFoto] })
      setNueva(nuevaFoto.id)
      navigator.vibrate?.(15)
      // la IA describe la foto; la cobertura ya está medida en el celular y no la toca
      if (navigator.onLine) {
        const fd = new FormData(); fd.append('foto', r.jpeg, 'foto.jpg'); fd.append('tipo', f.tipo)
        fetch('/api/ia/foto', { method: 'POST', body: fd }).then((x) => x.ok ? x.json() : null).then((j) => {
          if (j?.descripcion) window.dispatchEvent(new CustomEvent('surco-foto', { detail: { tipo: f.tipo, extra: { descripcion: j.descripcion, hojarasca: j.hojarasca } } }))
        }).catch(() => { /* sin IA queda la medición */ })
      }
    } finally { setMidiendo(false) }
  }

  return (
    <>
      <div className="subpasos" role="tablist" aria-label="Fotos">
        {FOTOS.map((x, i) => {
          const hecha = exp.fotos.some((y) => y.tipo === x.tipo)
          return (
            <button key={x.tipo} role="tab" aria-selected={i === sub} data-hecha={hecha} onClick={() => irSub(i)}>
              <span className="punto">{hecha ? <Icono n="brote" t={14} /> : i + 1}</span>{x.corto}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div key={f.tipo} custom={dir}
          initial={{ opacity: 0, x: dir * 32 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -32 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.32 }}>
          <h2 className="sub">{f.titulo}</h2>
          <p className="nota">{f.como}</p>

          {foto
            ? <Comparador foto={foto} barrer={nueva === foto.id} />
            : <Encuadre />}

          {foto && (
            <p className="medida">
              <span className="cifra">{foto.cobertura}%</span>
              <span>del suelo tapado por planta verde <Fuente titulo="Patrignani y Ochsner 2015, Agronomy Journal">Canopeo</Fuente></span>
            </p>
          )}
          {foto?.descripcion && <p className="nota">{foto.descripcion}</p>}

          {foto && (f.tipo === 'perennes' || f.tipo === 'cama') && (
            <div className="pregunta-corta">
              <p>¿Hay hojarasca o rastrojo seco tapando el suelo?</p>
              <div className="chips">
                {(['mucha', 'poca', 'nada'] as const).map((h) => (
                  <button key={h} className="chip" aria-pressed={foto.hojarasca === h}
                    onClick={() => cambiar({ fotos: exp.fotos.map((x) => x.tipo === f.tipo ? { ...x, hojarasca: h } : x) })}>{h[0].toUpperCase() + h.slice(1)}</button>
                ))}
              </div>
              {foto.hojarasca && foto.descripcion && <small className="nota">Sugerido por la foto. Cámbialo si no es así.</small>}
            </div>
          )}

          <div className="acciones">
            {TACTIL && (
              <label className="boton grande">
                <Icono n="camara" />{midiendo ? 'Midiendo…' : foto ? 'Tomar otra' : 'Tomar foto'}
                <input type="file" accept="image/*" capture="environment" hidden disabled={midiendo} onChange={(e) => { tomar(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            <label className={TACTIL ? 'boton claro' : 'boton grande'}>
              <Icono n="galeria" />{TACTIL ? 'De la galería' : midiendo ? 'Midiendo…' : 'Elegir una foto'}
              <input type="file" accept="image/*" hidden disabled={midiendo} onChange={(e) => { tomar(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {sub < FOTOS.length - 1 && <button className="boton fantasma" onClick={() => irSub(sub + 1)}>{foto ? 'Siguiente foto' : 'Saltar'}</button>}
          </div>
          {foto && <button className="enlace" onClick={() => cambiar({ fotos: exp.fotos.filter((x) => x.tipo !== f.tipo) })}>Quitar esta foto</button>}
        </motion.div>
      </AnimatePresence>
      <p className="nota pie">La parte verde se mide aquí en tu celular. La foto no se sube a ningún lado.</p>
    </>
  )
}

/** Foto y medición una encima de la otra; se desliza para comparar. La primera vez barre sola para mostrar qué midió. */
function Comparador({ foto, barrer }: { foto: Foto; barrer: boolean }) {
  const quieto = useReducedMotion()
  const [v, setV] = useState(barrer && !quieto ? 100 : 50)
  useEffect(() => {
    if (!barrer || quieto) return
    const a = animate(100, 50, { duration: 1.1, ease: [0.23, 1, 0.32, 1], onUpdate: setV })
    return () => a.stop()
  }, [barrer, quieto, foto.id])
  if (!foto.mascara) return <img className="foto" src={foto.miniatura} alt="Tu foto" />
  return (
    <div className="comparador" style={{ '--v': `${v}%` } as CSSProperties}>
      <img src={foto.miniatura} alt="Tu foto" />
      <img src={foto.mascara} alt="La parte verde que encontró la medición" className="capa" />
      <span className="raya" aria-hidden="true"><span /></span>
      <input type="range" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Desliza para comparar tu foto con lo que se midió como verde" />
      <span className="rotulo izq" aria-hidden="true">Tu foto</span>
      <span className="rotulo der" aria-hidden="true">Lo verde</span>
    </div>
  )
}

function Encuadre() {
  return (
    <div className="encuadre" aria-hidden="true">
      <svg viewBox="0 0 200 140" width="100%">
        <path d="M14 34V14h20M166 14h20v20M186 106v20h-20M34 126H14v-20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <g className="brotes">
          <path d="M70 92v-14m0 0c0-8 6-12 13-12 0 8-6 12-13 12Zm0 4c0-6-4-10-11-10 0 6 4 10 11 10Z" />
          <path d="M128 98v-12m0 0c0-7 5-10 11-10 0 7-5 10-11 10Zm0 3c0-5-4-8-9-8 0 5 4 8 9 8Z" />
        </g>
      </svg>
      <span>El suelo, visto desde arriba</span>
    </div>
  )
}

/* ---------------- Paso 4: la prueba de la lata ---------------- */

const CLASES = [
  [3, 'muy rápida'], [10, 'rápida'], [30, 'algo rápida'], [100, 'moderada'], [300, 'algo lenta'], [1000, 'lenta'], [Infinity, 'muy lenta'],
] as const
const claseInfil = (m: number) => CLASES.findIndex(([lim]) => m < lim)
const QUE_SIGNIFICA = (m: number) =>
  m < 10 ? 'El agua se cuela rápido y el suelo se seca pronto. Tapar el suelo ayuda a guardar la humedad.'
    : m < 100 ? 'El agua entra bien. El suelo respira.'
      : 'El agua se queda arriba: se encharca y corre. Las raíces hondas, como las del guandú, ayudan a abrir el suelo.'

const LLAVE_LATA = 'surco-lata-inicio'

export function Agua({ exp, cambiar }: Props) {
  const [inicio, setInicio] = useState<number | null>(() => local.leer<number>(LLAVE_LATA))
  const [como, setComo] = useState(false)
  const empezar = () => { const t = Date.now(); setInicio(t); local.poner(LLAVE_LATA, t); navigator.vibrate?.(20) }
  const terminar = () => {
    if (!inicio) return
    const min = Math.max(0.5, Math.round((Date.now() - inicio) / 30000) / 2) // redondeado al medio minuto
    cambiar({ infiltracion_min: min }); setInicio(null); local.quitar(LLAVE_LATA); navigator.vibrate?.([20, 60, 20])
  }
  const cancelar = () => { setInicio(null); local.quitar(LLAVE_LATA) }

  const [lata, setLata] = useState(() => exp.infiltracion_min != null || inicio != null)
  const CHARCOS = [['si', 'Sí, quedan charcos'], ['no', 'No, se seca rápido'], ['nose', 'No me he fijado']] as const

  return (
    <>
      <p className="pregunta-grande">Al día siguiente de un aguacero fuerte, ¿quedan charcos en el huerto?</p>
      <div className="chips">
        {CHARCOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.charcos === k} onClick={() => cambiar({ charcos: exp.charcos === k ? null : k })}>{n}</button>)}
      </div>
      <p className="nota">Con eso basta para seguir. La prueba de la lata es opcional: mide lo mismo con reloj.</p>

      <button className="boton claro lata-abrir" onClick={() => setLata(!lata)} aria-expanded={lata}>
        <Icono n="gota" />{lata ? 'Ocultar la prueba de la lata' : 'Quiero medirlo con una lata'}
      </button>
      <AnimatePresence initial={false}>
        {lata && (
          <motion.div key="lata" className="lata" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>
      <GuiaLata />
      <p className="nota desliza"><button className="enlace" onClick={() => setComo(true)}>Los 7 pasos en texto, con más detalle</button></p>
      <Reloj inicio={inicio} />
      <div className="acciones centro">
        {inicio
          ? <><button className="boton grande agua" onClick={terminar}><Icono n="gota" />Listo, ya se fue el agua</button><button className="enlace" onClick={cancelar}>Cancelar</button></>
          : <button className="boton grande agua" onClick={empezar}><Icono n="gota" />Empezar a medir</button>}
      </div>

      <label className="campo en-linea">
        <span>¿Ya la hiciste? Minutos de la segunda vez:</span>
        <input type="number" inputMode="decimal" min="0" max="2000" step="0.5"
          value={exp.infiltracion_min ?? ''} onChange={(e) => cambiar({ infiltracion_min: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>

      {exp.infiltracion_min != null && exp.infiltracion_min >= 0 && <Escala min={exp.infiltracion_min} />}
          </motion.div>
        )}
      </AnimatePresence>

      <Hoja abierta={como} cerrar={() => setComo(false)} titulo="La prueba de la lata">
        <ol className="receta larga">
          <li><b>La lata.</b> Una de unos 15 cm de ancho, como la de leche en polvo grande o la de pintura de un galón. Quítale el fondo y la tapa con abrelatas y pásale una lima o una piedra por la orilla para no cortarte.</li>
          <li><b>Dónde.</b> En el huerto, donde no hayas pisado ni cavado hoy. Quita las hojas sueltas, sin arrancar las raíces.</li>
          <li><b>Enterrarla.</b> Marca la lata a 7 u 8 cm del borde. Pon una tablita encima y golpéala con un martillo o una piedra, parejo, hasta la marca. Aprieta con el dedo la tierra pegada a la orilla por dentro, para que el agua no se escape por el lado.</li>
          <li><b>El agua.</b> Mide 450 mL: casi dos tazas. Pon una bolsa plástica dentro de la lata, echa el agua encima de la bolsa y saca la bolsa con cuidado. Así no se revuelve la tierra.</li>
          <li><b>La primera vez</b> solo moja el suelo. Espera a que se vaya toda el agua, no hace falta medirla.</li>
          <li><b>La segunda vez es la que cuenta.</b> Repite con otros 450 mL y toca «Empezar a medir». Cuando ya no quede agua y la tierra deje de brillar, toca «Listo».</li>
          <li><b>Si puedes,</b> hazla también en otro punto, por ejemplo debajo de un árbol. Pon aquí el tiempo del huerto.</li>
        </ol>
        <p className="nota">Es la prueba de infiltración de la guía del USDA (Soil Quality Test Kit, 1999), hecha con una lata en vez del anillo de metal. <a href="https://www.fao.org/fileadmin/user_upload/GSP/GSDP/Field_exercises/New_Format_ES/P04-Infiltration-ES.pdf" target="_blank" rel="noreferrer">La FAO la explica con fotos</a> (Doctores de Suelos, ejercicio P05).</p>
      </Hoja>
    </>
  )
}

/** El reloj de la prueba. El anillo da la vuelta cada minuto; el número es lo que importa. */
function Reloj({ inicio }: { inicio: number | null }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    if (!inicio) return
    let raf = 0, lock: { release(): Promise<void> } | null = null
    const paso = () => { setAhora(Date.now()); raf = requestAnimationFrame(paso) }
    raf = requestAnimationFrame(paso)
    // la pantalla no se apaga mientras corre la prueba
    ;(navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l }).catch(() => { /* no soportado */ })
    return () => { cancelAnimationFrame(raf); lock?.release().catch(() => {}) }
  }, [inicio])
  const ms = inicio ? Math.max(0, ahora - inicio) : 0
  const s = Math.floor(ms / 1000)
  const R = 54, C = 2 * Math.PI * R
  return (
    <div className="reloj" data-corre={!!inicio} role="timer" aria-live="off">
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="pista" cx="64" cy="64" r={R} />
        <circle className="avance" cx="64" cy="64" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - (ms % 60000) / 60000)} transform="rotate(-90 64 64)" />
      </svg>
      <span className="digitos">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>
    </div>
  )
}

function Escala({ min }: { min: number }) {
  const i = claseInfil(min)
  return (
    <div className="escala">
      <p className="medida"><span className="cifra">{min}</span><span>minutos: el agua entra de forma <b>{CLASES[i][1]}</b> <Fuente titulo="USDA, Soil Quality Test Kit Guide 1999, tabla 3">USDA</Fuente></span></p>
      <div className="regla" role="img" aria-label={`Clase ${i + 1} de 7: ${CLASES[i][1]}`}>
        {CLASES.map(([, n], k) => <motion.span key={n} data-esta={k === i} layout transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}>{k === i ? n : ''}</motion.span>)}
      </div>
      <div className="regla-ejes" aria-hidden="true"><span>Rápida</span><span>Lenta</span></div>
      <p>{QUE_SIGNIFICA(min)}</p>
    </div>
  )
}

/* ---------------- Paso 5: lo que te importa ---------------- */

const PRIORIDADES: [string, string, string][] = [
  ['agua', 'Gastar menos agua', 'Que el suelo aguante el verano'],
  ['suelo', 'Mejorar el suelo', 'Que esté más vivo y suelto'],
  ['comida', 'Comida para la casa', 'Algo que se coma pronto'],
  ['venta', 'Algo para vender', 'Que deje unos reales'],
  ['trabajo', 'Menos trabajo', 'Que no pida tanta mano'],
]

export function Importa({ exp, cambiar }: Props) {
  const alternar = (v: string) => cambiar({ prioridades: exp.prioridades.includes(v) ? exp.prioridades.filter((x) => x !== v) : [...exp.prioridades, v] })
  return (
    <>
      <p className="nota">Escoge una o varias. Ordena las maneras de sembrar según lo tuyo.</p>
      <div className="tejas">
        {PRIORIDADES.map(([k, n, d]) => (
          <button key={k} className="teja" aria-pressed={exp.prioridades.includes(k)} onClick={() => alternar(k)}>
            <b>{n}</b><span>{d}</span>
          </button>
        ))}
      </div>
      <h2 className="sub">¿Riegas en verano?</h2>
      <div className="chips">
        {(['no', 'a veces', 'si'] as const).map((r) => (
          <button key={r} className="chip" aria-pressed={exp.riego === r} onClick={() => cambiar({ riego: exp.riego === r ? '' : r })}>{r === 'si' ? 'Sí' : r[0].toUpperCase() + r.slice(1)}</button>
        ))}
      </div>
    </>
  )
}
