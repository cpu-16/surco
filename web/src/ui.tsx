import { L } from './i18n'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls } from 'motion/react'

const TRAZOS = {
  sol: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  luna: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  bajar: 'M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  atras: 'M15 5l-7 7 7 7',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  ubicar: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 17v4',
  compartir: 'M12 3v12M12 3 7.5 7.5M12 3l4.5 4.5M5 12v8h14v-8',
  brote: 'M12 21v-8M12 13c0-4.4 3-7 7.5-7 0 4.4-3 7-7.5 7ZM12 15c0-3.3-2.4-5.5-6-5.5 0 3.3 2.4 5.5 6 5.5Z',
  gota: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z',
  cerrar: 'M6 6l12 12M18 6 6 18',
  enviar: 'M4 12 20 4l-6 16-2.5-6.5L4 12Z',
  galeria: 'M4 5h16v14H4ZM4 16l4.5-4.5 4 4 3-3L20 17M15.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  altavoz: 'M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7',
} as const

export function Icono({ n, t = 20 }: { n: keyof typeof TRAZOS; t?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[n]} />
    </svg>
  )
}

/** Hoja que sube desde abajo. Se cierra arrastrándola: si el dedo va rápido basta un empujón (velocidad, no distancia). */
export function Hoja({ abierta, cerrar, titulo, children }: { abierta: boolean; cerrar: () => void; titulo: string; children: ReactNode }) {
  const asa = useDragControls()
  const cab = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => cab.current?.focus(), 60)
    return () => { removeEventListener('keydown', tecla); document.body.style.overflow = ''; clearTimeout(t) }
  }, [abierta, cerrar])
  const fuera = typeof window === 'undefined' ? 800 : window.innerHeight
  return createPortal(
    <AnimatePresence>
      {abierta && (
        <>
          <motion.div key="velo" className="velo" onClick={cerrar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} />
          <motion.div key="hoja" className="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-t"
            initial={{ y: fuera }} animate={{ y: 0 }} exit={{ y: fuera }}
            transition={{ type: 'spring', bounce: 0.12, duration: 0.45 }}
            drag="y" dragControls={asa} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.03, bottom: 0.9 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 450) cerrar() }}>
            <div className="asa" onPointerDown={(e) => asa.start(e)} style={{ touchAction: 'none' }} aria-hidden="true"><span /></div>
            <div className="hoja-cab">
              <h2 id="hoja-t" ref={cab} tabIndex={-1}>{titulo}</h2>
              <button className="icono-btn" onClick={cerrar} aria-label={L("Cerrar", "Close")}><Icono n="cerrar" /></button>
            </div>
            <div className="hoja-cuerpo">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Mientras llegan los datos: una fila de terrones que respira, sin girar nada. */
export function Cargando({ texto }: { texto: string }) {
  return (
    <div className="cargando" role="status">
      <div className="terrones-carga" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</div>
      <p className="nota">{texto}</p>
    </div>
  )
}

/** Chip pequeño que dice de dónde sale un número. */
export const Fuente = ({ children, titulo }: { children: ReactNode; titulo?: string }) => <span className="fuente" title={titulo}>{children}</span>

export const fecha = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  return L(`${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}${a !== new Date().getFullYear() ? ` de ${a}` : ''}`, `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}${a !== new Date().getFullYear() ? `, ${a}` : ''}`)
}

/** «del 8 al 11 de noviembre» o «del 28 de octubre al 3 de noviembre» */
export const rango = (a: string, b: string) => L(
  a.slice(0, 7) === b.slice(0, 7) ? `del ${Number(a.slice(8))} al ${fecha(b)}` : `del ${fecha(a)} al ${fecha(b)}`,
  a.slice(0, 7) === b.slice(0, 7)
    ? `from ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(a.slice(5, 7)) - 1]} ${Number(a.slice(8))} to ${Number(b.slice(8))}${Number(b.slice(0, 4)) !== new Date().getFullYear() ? `, ${b.slice(0, 4)}` : ''}`
    : `from ${fecha(a)} to ${fecha(b)}`,
)
