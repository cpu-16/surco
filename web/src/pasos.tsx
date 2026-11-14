import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { local, type Expediente, type Foto, type Lugar, type TipoFoto } from './api'
import { medir } from './canopeo'
import { GuiaLata } from './guia'
import { idioma, L } from './i18n'
import { Fuente, Hoja, Icono } from './ui'

type Props = { exp: Expediente; cambiar: (p: Partial<Expediente>) => void }

export const CULTIVOS: [string, string][] = [
  ['yuca', L('Yuca', 'Cassava')], ['pina', L('Piña', 'Pineapple')], ['platano', L('Plátano', 'Plantain')], ['cacao', L('Cacao', 'Cocoa (cacao)')], ['naranja', L('Naranja', 'Orange')], ['toronja', L('Toronja', 'Grapefruit')],
  ['maiz', L('Maíz', 'Corn')], ['frijol', L('Frijol', 'Beans')], ['guandu', L('Guandú', 'Pigeon pea')], ['otoe', L('Otoe', 'Taro (otoe)')], ['name', L('Ñame', 'Yam')], ['zapallo', L('Zapallo', 'Squash')],
]

/** Los que duran años: no se les pregunta la fecha de siembra. */
const ARBOLES = new Set(['cacao', 'naranja', 'toronja', 'platano', 'mango', 'aguacate', 'limón', 'limon', 'coco', 'guanábana', 'café', 'cafe', 'marañón', 'nance'])
export const nombreDe = (c: string) => CULTIVOS.find(([k]) => k === c)?.[1] ?? c[0].toUpperCase() + c.slice(1)

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
    if (!navigator.geolocation) return setAviso(L('Este navegador no da la ubicación.', "This browser can't share your location."))
    setBuscando(true); setAviso('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setBuscando(false); cambiar({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }) },
      () => { setBuscando(false); setAviso(L('No se pudo leer la ubicación. Revisa el permiso del navegador.', "Couldn't read your location. Check the browser's permission.")) },
      { enableHighAccuracy: false, timeout: 15000 },
    )
  }
  return (
    <>
      <div className="lugar">
        <div className="lugar-dato">
          <span className="cifra">{lugar ? Math.round(lugar.punto.elevacion_m) : '…'}<small> m</small></span>
          <span className="nota">{L('sobre el mar', 'above sea level')}</span>
        </div>
        <div className="lugar-texto">
          <p><strong>{L('Cerca de', 'Near')} {exp.lat.toFixed(2)}, {exp.lon.toFixed(2)}</strong></p>
          <p className="nota">{L('Redondeado a 1 km. Tu casa exacta no sale del celular.', 'Rounded to 1 km. Your exact home never leaves your phone.')}</p>
        </div>
        <button className="boton claro lugar-boton" onClick={ubicar} disabled={buscando}><Icono n="ubicar" />{buscando ? L('Buscando…', 'Searching…') : L('Usar mi ubicación', 'Use my location')}</button>
        {aviso && <p className="nota alerta lugar-boton" role="alert">{aviso}</p>}
      </div>

      <h2 className="sub">{L('¿Qué tienes sembrado?', 'What do you have planted?')}</h2>
      <div className="chips">
        {CULTIVOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.cultivos.includes(k)} onClick={() => alternar(k)}>{n}</button>)}
        <AnimatePresence initial={false}>
          {propios.map((c) => (
            <motion.button key={c} className="chip" aria-pressed="true" onClick={() => alternar(c)} aria-label={L(`Quitar ${c}`, `Remove ${c}`)}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}>
              {c[0].toUpperCase() + c.slice(1)}<Icono n="cerrar" t={14} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <form className="otro" onSubmit={agregar}>
        <input value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={40} enterKeyHint="done"
          placeholder={L('¿Otro? Ej.: ají, mango, culantro', 'Another one? E.g.: hot pepper, mango, culantro')} aria-label={L('Escribe otro cultivo', 'Type another crop')} />
        <button className="boton claro" disabled={!otro.trim()}>{L('Agregar', 'Add')}</button>
      </form>

      {cortos.length > 0 && (
        <fieldset className="campo siembra">
          <legend>{L('¿Cuándo los sembraste?', 'When did you plant them?')}</legend>
          {cortos.map((c) => (
            <Siembra key={c} nombre={nombreDe(c)} valor={exp.siembras[c] ?? ''} poner={(v) => cambiar({ siembras: { ...exp.siembras, [c]: v } })} />
          ))}
          <small className="nota">{L('Los árboles no hacen falta.', 'Trees are not needed.')}{exp.cultivos.includes('yuca') && !exp.siembras.yuca ? L(' Si no pones la yuca, calculo como si fuera en mayo.', " If you leave out the cassava, I'll count it as planted in May.") : ''}</small>
        </fieldset>
      )}
      <label className="campo">
        <span>{L('Nombre del patio', 'Name of your plot')}</span>
        <input value={exp.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
      </label>
    </>
  )
}

const MESES_N = L(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])

/** Mes y año con dos listas: más claro que el selector de fecha en cualquier celular. */
function Siembra({ nombre, valor, poner }: { nombre: string; valor: string; poner: (v: string) => void }) {
  const hoy = new Date()
  const [a, m] = valor ? valor.split('-').map(Number) : [0, 0]
  const anos = [hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2, hoy.getFullYear() - 3]
  const fijar = (na: number, nm: number) => poner(na && nm ? `${na}-${String(nm).padStart(2, '0')}` : '')
  return (
    <div className="fila-siembra">
      <span>{nombre}</span>
      <select aria-label={L(`Mes en que sembraste ${nombre}`, `Month you planted ${nombre}`)} value={m || ''} onChange={(e) => fijar(a || anos[0], Number(e.target.value))}>
        <option value="">{L('Mes', 'Month')}</option>
        {MESES_N.map((n, i) => <option key={n} value={i + 1}>{n[0].toUpperCase() + n.slice(1)}</option>)}
      </select>
      <select aria-label={L(`Año en que sembraste ${nombre}`, `Year you planted ${nombre}`)} value={a || ''} onChange={(e) => fijar(Number(e.target.value), m || 5)}>
        <option value="">{L('Año', 'Year')}</option>
        {anos.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}

/* ---------------- Paso 3: las fotos, una por una ---------------- */

export const FOTOS: { tipo: TipoFoto; corto: string; titulo: string; como: string }[] = [
  { tipo: 'cama', corto: L('El huerto', 'The garden plot'), titulo: L('El suelo del huerto (yuca, piña…)', 'The soil of the garden plot (cassava, pineapple…)'), como: L('De pie, con el celular a la altura del pecho, mirando hacia abajo.', 'Standing up, with the phone at chest height, pointing down.') },
  { tipo: 'perennes', corto: L('Bajo los árboles', 'Under the trees'), titulo: L('El suelo debajo del cacao o los cítricos', 'The soil under the cocoa (cacao) or citrus trees'), como: L('Igual, pero debajo de la copa. El satélite no puede ver esto.', "The same way, but under the tree crown. The satellite can't see this.") },
  { tipo: 'pina', corto: L('Una piña', 'A pineapple'), titulo: L('Una piña completa', 'A whole pineapple plant'), como: L('La planta entera con su base, para ver cómo está.', 'The whole plant with its base, to see how it is doing.') },
  { tipo: 'general', corto: L('El patio', 'The plot'), titulo: L('El patio entero', 'The whole plot'), como: L('Desde una esquina, para ver si hay pendiente.', 'From a corner, to see if there is a slope.') },
]

/** Lo que dice cada botón; la clave es lo que se guarda. */
const HOJARASCA = { mucha: L('Mucha', 'A lot'), poca: L('Poca', 'A little'), nada: L('Nada', 'None') }

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
        const fd = new FormData(); fd.append('foto', r.jpeg, 'foto.jpg'); fd.append('tipo', f.tipo); fd.append('lang', idioma)
        fetch('/api/ia/foto', { method: 'POST', body: fd }).then((x) => x.ok ? x.json() : null).then((j) => {
          if (j?.descripcion) window.dispatchEvent(new CustomEvent('surco-foto', { detail: { tipo: f.tipo, extra: { descripcion: j.descripcion, hojarasca: j.hojarasca } } }))
        }).catch(() => { /* sin IA queda la medición */ })
      }
    } finally { setMidiendo(false) }
  }

  return (
    <>
      <div className="subpasos" role="tablist" aria-label={L('Fotos', 'Photos')}>
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
              <span>{L('del suelo tapado por planta verde', 'of the soil covered by green plants')} <Fuente titulo={L('Patrignani y Ochsner 2015, Agronomy Journal', 'Patrignani and Ochsner 2015, Agronomy Journal')}>Canopeo</Fuente></span>
            </p>
          )}
          {foto?.descripcion && <p className="nota">{foto.descripcion}</p>}

          {foto && (f.tipo === 'perennes' || f.tipo === 'cama') && (
            <div className="pregunta-corta">
              <p>{L('¿Hay hojarasca o rastrojo seco tapando el suelo?', 'Is there leaf litter or dry crop residue covering the soil?')}</p>
              <div className="chips">
                {(['mucha', 'poca', 'nada'] as const).map((h) => (
                  <button key={h} className="chip" aria-pressed={foto.hojarasca === h}
                    onClick={() => cambiar({ fotos: exp.fotos.map((x) => x.tipo === f.tipo ? { ...x, hojarasca: h } : x) })}>{HOJARASCA[h]}</button>
                ))}
              </div>
              {foto.hojarasca && foto.descripcion && <small className="nota">{L('Sugerido por la foto. Cámbialo si no es así.', "Suggested by the photo. Change it if it's not right.")}</small>}
            </div>
          )}

          <div className="acciones">
            {TACTIL && (
              <label className="boton grande">
                <Icono n="camara" />{midiendo ? L('Midiendo…', 'Measuring…') : foto ? L('Tomar otra', 'Take another') : L('Tomar foto', 'Take a photo')}
                <input type="file" accept="image/*" capture="environment" hidden disabled={midiendo} onChange={(e) => { tomar(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            )}
            <label className={TACTIL ? 'boton claro' : 'boton grande'}>
              <Icono n="galeria" />{TACTIL ? L('De la galería', 'From the gallery') : midiendo ? L('Midiendo…', 'Measuring…') : L('Elegir una foto', 'Choose a photo')}
              <input type="file" accept="image/*" hidden disabled={midiendo} onChange={(e) => { tomar(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {sub < FOTOS.length - 1 && <button className="boton fantasma" onClick={() => irSub(sub + 1)}>{foto ? L('Siguiente foto', 'Next photo') : L('Saltar', 'Skip')}</button>}
          </div>
          {foto && <button className="enlace" onClick={() => cambiar({ fotos: exp.fotos.filter((x) => x.tipo !== f.tipo) })}>{L('Quitar esta foto', 'Remove this photo')}</button>}
        </motion.div>
      </AnimatePresence>
      <p className="nota pie">{L('La parte verde se mide aquí en tu celular. La foto no se sube a ningún lado.', "The green part is measured here on your phone. The photo isn't uploaded anywhere.")}</p>
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
  if (!foto.mascara) return <img className="foto" src={foto.miniatura} alt={L('Tu foto', 'Your photo')} />
  return (
    <div className="comparador" style={{ '--v': `${v}%` } as CSSProperties}>
      <img src={foto.miniatura} alt={L('Tu foto', 'Your photo')} />
      <img src={foto.mascara} alt={L('La parte verde que encontró la medición', 'The green part the measurement found')} className="capa" />
      <span className="raya" aria-hidden="true"><span /></span>
      <input type="range" min={0} max={100} value={v} onChange={(e) => setV(Number(e.target.value))} aria-label={L('Desliza para comparar tu foto con lo que se midió como verde', 'Slide to compare your photo with what was measured as green')} />
      <span className="rotulo izq" aria-hidden="true">{L('Tu foto', 'Your photo')}</span>
      <span className="rotulo der" aria-hidden="true">{L('Lo verde', 'The green')}</span>
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
      <span>{L('El suelo, visto desde arriba', 'The soil, seen from above')}</span>
    </div>
  )
}

/* ---------------- Paso 4: la prueba de la lata ---------------- */

const CLASES = [
  [3, L('muy rápida', 'very fast')], [10, L('rápida', 'fast')], [30, L('algo rápida', 'fairly fast')], [100, L('moderada', 'medium')],
  [300, L('algo lenta', 'fairly slow')], [1000, L('lenta', 'slow')], [Infinity, L('muy lenta', 'very slow')],
] as const
const claseInfil = (m: number) => CLASES.findIndex(([lim]) => m < lim)
const QUE_SIGNIFICA = (m: number) =>
  m < 10 ? L('El agua se cuela rápido y el suelo se seca pronto. Tapar el suelo ayuda a guardar la humedad.', 'Water drains through fast and the soil dries out soon. Covering the soil helps keep the moisture in.')
    : m < 100 ? L('El agua entra bien. El suelo respira.', 'Water soaks in well. The soil can breathe.')
      : L('El agua se queda arriba: se encharca y corre. Las raíces hondas, como las del guandú, ayudan a abrir el suelo.', 'Water stays on top: it makes puddles and runs off. Deep roots, like those of pigeon pea, help open up the soil.')

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
  const CHARCOS = [['si', L('Sí, quedan charcos', 'Yes, there are puddles')], ['no', L('No, se seca rápido', 'No, it dries fast')], ['nose', L('No me he fijado', "I haven't noticed")]] as const

  return (
    <>
      <p className="pregunta-grande">{L('Al día siguiente de un aguacero fuerte, ¿quedan charcos en el huerto?', 'The day after a heavy rain, are there puddles left in the garden plot?')}</p>
      <div className="chips">
        {CHARCOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.charcos === k} onClick={() => cambiar({ charcos: exp.charcos === k ? null : k })}>{n}</button>)}
      </div>
      <p className="nota">{L('Con eso basta para seguir. La prueba de la lata es opcional: mide lo mismo con reloj.', "That's enough to go on. The can test is optional: it measures the same thing with a clock.")}</p>

      <button className="boton claro lata-abrir" onClick={() => setLata(!lata)} aria-expanded={lata}>
        <Icono n="gota" />{lata ? L('Ocultar la prueba de la lata', 'Hide the can test') : L('Quiero medirlo con una lata', 'I want to measure it with a can')}
      </button>
      <AnimatePresence initial={false}>
        {lata && (
          <motion.div key="lata" className="lata" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>
      <GuiaLata />
      <p className="nota desliza"><button className="enlace" onClick={() => setComo(true)}>{L('Los 7 pasos en texto, con más detalle', 'The 7 steps in writing, with more detail')}</button></p>
      <Reloj inicio={inicio} />
      <div className="acciones centro">
        {inicio
          ? <><button className="boton grande agua" onClick={terminar}><Icono n="gota" />{L('Listo, ya se fue el agua', 'Done, the water is gone')}</button><button className="enlace" onClick={cancelar}>{L('Cancelar', 'Cancel')}</button></>
          : <button className="boton grande agua" onClick={empezar}><Icono n="gota" />{L('Empezar a medir', 'Start measuring')}</button>}
      </div>

      <label className="campo en-linea">
        <span>{L('¿Ya la hiciste? Minutos de la segunda vez:', 'Already did it? Minutes the second time:')}</span>
        <input type="number" inputMode="decimal" min="0" max="2000" step="0.5"
          value={exp.infiltracion_min ?? ''} onChange={(e) => cambiar({ infiltracion_min: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>

      {exp.infiltracion_min != null && exp.infiltracion_min >= 0 && <Escala min={exp.infiltracion_min} />}
          </motion.div>
        )}
      </AnimatePresence>

      <Hoja abierta={como} cerrar={() => setComo(false)} titulo={L('La prueba de la lata', 'The can test')}>
        <ol className="receta larga">
          <li>{L(<><b>La lata.</b> Una de unos 15 cm de ancho, como la de leche en polvo grande o la de pintura de un galón. Quítale el fondo y la tapa con abrelatas y pásale una lima o una piedra por la orilla para no cortarte.</>,
            <><b>The can.</b> One about 15 cm wide, like a big powdered milk can or a one-gallon paint can. Take off the bottom and the lid with a can opener, and rub the edge with a file or a stone so you don't cut yourself.</>)}</li>
          <li>{L(<><b>Dónde.</b> En el huerto, donde no hayas pisado ni cavado hoy. Quita las hojas sueltas, sin arrancar las raíces.</>,
            <><b>Where.</b> In the garden plot, in a spot you haven't stepped on or dug today. Clear away the loose leaves, without pulling up the roots.</>)}</li>
          <li>{L(<><b>Enterrarla.</b> Marca la lata a 7 u 8 cm del borde. Pon una tablita encima y golpéala con un martillo o una piedra, parejo, hasta la marca. Aprieta con el dedo la tierra pegada a la orilla por dentro, para que el agua no se escape por el lado.</>,
            <><b>Drive it in.</b> Mark the can 7 or 8 cm from the edge. Put a small board on top and hit it evenly with a hammer or a stone, down to the mark. With your finger, press the soil against the inside edge, so the water doesn't leak out the side.</>)}</li>
          <li>{L(<><b>El agua.</b> Mide 450 mL: casi dos tazas. Pon una bolsa plástica dentro de la lata, echa el agua encima de la bolsa y saca la bolsa con cuidado. Así no se revuelve la tierra.</>,
            <><b>The water.</b> Measure 450 mL: almost two cups. Put a plastic bag inside the can, pour the water onto the bag and pull the bag out carefully. That way the soil doesn't get stirred up.</>)}</li>
          <li>{L(<><b>La primera vez</b> solo moja el suelo. Espera a que se vaya toda el agua, no hace falta medirla.</>,
            <><b>The first time</b> only wets the soil. Wait for all the water to soak in; you don't need to time it.</>)}</li>
          <li>{L(<><b>La segunda vez es la que cuenta.</b> Repite con otros 450 mL y toca «Empezar a medir». Cuando ya no quede agua y la tierra deje de brillar, toca «Listo».</>,
            <><b>The second time is the one that counts.</b> Repeat with another 450 mL and tap “Start measuring”. When there is no water left and the soil stops shining, tap “Done”.</>)}</li>
          <li>{L(<><b>Si puedes,</b> hazla también en otro punto, por ejemplo debajo de un árbol. Pon aquí el tiempo del huerto.</>,
            <><b>If you can,</b> also do it in another spot, for example under a tree. Enter the garden plot's time here.</>)}</li>
        </ol>
        <p className="nota">{L(<>Es la prueba de infiltración de la guía del USDA (Soil Quality Test Kit, 1999), hecha con una lata en vez del anillo de metal. <a href="https://www.fao.org/fileadmin/user_upload/GSP/GSDP/Field_exercises/New_Format_ES/P04-Infiltration-ES.pdf" target="_blank" rel="noreferrer">La FAO la explica con fotos</a> (Doctores de Suelos, ejercicio P05).</>,
          <>It is the infiltration test from the USDA guide (Soil Quality Test Kit, 1999), done with a can instead of the metal ring. <a href="https://www.fao.org/fileadmin/user_upload/GSP/GSDP/Field_exercises/New_Format_ES/P04-Infiltration-ES.pdf" target="_blank" rel="noreferrer">FAO explains it with photos</a> (Soil Doctors, exercise P05, in Spanish).</>)}</p>
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
      <p className="medida"><span className="cifra">{min}</span><span>{L(<>minutos: el agua entra de forma <b>{CLASES[i][1]}</b></>, <>minutes: the water soaks in at a <b>{CLASES[i][1]}</b> speed</>)} <Fuente titulo={L('USDA, Soil Quality Test Kit Guide 1999, tabla 3', 'USDA, Soil Quality Test Kit Guide 1999, table 3')}>USDA</Fuente></span></p>
      <div className="regla" role="img" aria-label={L(`Clase ${i + 1} de 7: ${CLASES[i][1]}`, `Class ${i + 1} of 7: ${CLASES[i][1]}`)}>
        {CLASES.map(([, n], k) => <motion.span key={n} data-esta={k === i} layout transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}>{k === i ? n : ''}</motion.span>)}
      </div>
      <div className="regla-ejes" aria-hidden="true"><span>{L('Rápida', 'Fast')}</span><span>{L('Lenta', 'Slow')}</span></div>
      <p>{QUE_SIGNIFICA(min)}</p>
    </div>
  )
}

/* ---------------- Paso 5: lo que te importa ---------------- */

const PRIORIDADES: [string, string, string][] = [
  ['agua', L('Gastar menos agua', 'Use less water'), L('Que el suelo aguante el verano', 'So the soil holds up through the dry season')],
  ['suelo', L('Mejorar el suelo', 'Improve the soil'), L('Que esté más vivo y suelto', 'More alive and loose')],
  ['comida', L('Comida para la casa', 'Food for the home'), L('Algo que se coma pronto', 'Something to eat soon')],
  ['venta', L('Algo para vender', 'Something to sell'), L('Que deje unos reales', 'That brings in some money')],
  ['trabajo', L('Menos trabajo', 'Less work'), L('Que no pida tanta mano', "That doesn't take so many hands")],
]

/** Lo que dice cada botón; la clave es lo que se guarda. */
const RIEGO = { no: L('No', 'No'), 'a veces': L('A veces', 'Sometimes'), si: L('Sí', 'Yes') }

export function Importa({ exp, cambiar }: Props) {
  const alternar = (v: string) => cambiar({ prioridades: exp.prioridades.includes(v) ? exp.prioridades.filter((x) => x !== v) : [...exp.prioridades, v] })
  return (
    <>
      <p className="nota">{L('Escoge una o varias. Ordena las maneras de sembrar según lo tuyo.', 'Pick one or more. This sorts the ways of planting by what matters to you.')}</p>
      <div className="tejas">
        {PRIORIDADES.map(([k, n, d]) => (
          <button key={k} className="teja" aria-pressed={exp.prioridades.includes(k)} onClick={() => alternar(k)}>
            <b>{n}</b><span>{d}</span>
          </button>
        ))}
      </div>
      <h2 className="sub">{L('¿Riegas en verano?', 'Do you water in the dry season?')}</h2>
      <div className="chips">
        {(['no', 'a veces', 'si'] as const).map((r) => (
          <button key={r} className="chip" aria-pressed={exp.riego === r} onClick={() => cambiar({ riego: exp.riego === r ? '' : r })}>{RIEGO[r]}</button>
        ))}
      </div>
    </>
  )
}
