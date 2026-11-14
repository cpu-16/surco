import { useRef, useState, type ReactNode } from 'react'
import { L } from './i18n'
import { Icono } from './ui'

/* La prueba de la lata en dibujos: una tarjeta por paso, se desliza con el dedo.
   Medidas de la guía del USDA (anillo de 6 pulgadas enterrado 3) y del ejercicio P05 de la FAO (444 mL). */

const SUELO = (
  <>
    <rect x="0" y="70" width="160" height="40" fill="var(--laterita)" opacity="0.22" />
    <path d="M0 70H160" stroke="var(--laterita)" strokeWidth="2" />
  </>
)

/** La lata metida en la tierra: arriba se ve entera, abajo punteada. */
const LATA = (
  <>
    <path d="M56 50V70M104 50V70" />
    <path d="M56 70V90M104 70V90M56 90a24 6 0 0 0 48 0" strokeDasharray="3 3" opacity="0.55" />
    <ellipse cx="80" cy="50" rx="24" ry="6" />
  </>
)

const PASOS: { dibujo: ReactNode; texto: ReactNode }[] = [
  {
    texto: L(<><b>Una lata sin fondo ni tapa</b>, de unos 15 cm de ancho (la de leche en polvo grande). Lima la orilla.</>,
      <><b>A can with no bottom and no lid</b>, about 15 cm wide (like a big powdered milk can). File down the edge.</>),
    dibujo: (
      <>
        <ellipse cx="80" cy="30" rx="24" ry="6" strokeDasharray="4 3" />
        <path d="M56 30V84M104 30V84M56 84a24 6 0 0 0 48 0" />
        <path d="M56 84a24 6 0 0 1 48 0" strokeDasharray="4 3" opacity="0.5" />
        <path d="M56 14h48M56 10v8M104 10v8" strokeWidth="1.5" />
        <text x="80" y="9" textAnchor="middle">15 cm</text>
        {/* el fondo y la tapa, afuera y tachados */}
        <ellipse cx="26" cy="64" rx="15" ry="4.5" fill="var(--superficie)" />
        <ellipse cx="134" cy="64" rx="15" ry="4.5" fill="var(--superficie)" />
        <path d="M18 56l16 16M34 56 18 72M126 56l16 16M142 56l-16 16" stroke="var(--alerta)" strokeWidth="2.5" />
      </>
    ),
  },
  {
    texto: L(<><b>Entiérrala 7 a 8 cm</b>: pon una tablita encima y dale parejo con un martillo o una piedra.</>,
      <><b>Drive it 7 to 8 cm into the ground</b>: put a small board on top and tap it evenly with a hammer or a stone.</>),
    dibujo: (
      <>
        {SUELO}{LATA}
        <rect x="46" y="36" width="68" height="8" rx="2" fill="var(--rastrojo)" />
        <g transform="translate(-4 10) rotate(-28 122 26)">
          <path d="M122 26h34" strokeWidth="4" />
          <rect x="112" y="14" width="12" height="24" rx="2" fill="var(--tinta-2)" />
        </g>
        <path d="M98 30q4-6 10-6M94 24q5-8 13-8" strokeWidth="1.5" opacity="0.6" />
        <path d="M118 70v20M114 70h8M114 90h8" strokeWidth="1.5" />
        <text x="124" y="84">7–8 cm</text>
      </>
    ),
  },
  {
    texto: L(<><b>Pon una bolsa plástica adentro</b> y échale encima casi 2 tazas de agua (450 mL).</>,
      <><b>Put a plastic bag inside</b> and pour almost 2 cups of water (450 mL) onto it.</>),
    dibujo: (
      <>
        {SUELO}{LATA}
        <path d="M58 50q2 18 22 20q20-2 22-20" fill="var(--lluvia)" fillOpacity="0.25" stroke="var(--tinta-2)" />
        <path d="M26 8l22 6-6 20-18-5z" fill="var(--superficie)" />
        <path d="M46 20q22 4 30 30" stroke="var(--lluvia)" strokeWidth="3.5" />
        <text x="12" y="46">{L('2 tazas', '2 cups')}</text>
      </>
    ),
  },
  {
    texto: L(<><b>Saca la bolsa despacio.</b> Así el agua queda en la lata sin revolver la tierra.</>,
      <><b>Pull the bag out slowly.</b> That way the water stays in the can without stirring up the soil.</>),
    dibujo: (
      <>
        {SUELO}{LATA}
        <ellipse cx="80" cy="54" rx="22" ry="4.5" fill="var(--lluvia)" stroke="none" opacity="0.85" />
        <path d="M64 12q1 12 16 13q15-1 16-13" stroke="var(--tinta-2)" />
        <path d="M80 4v-2M80 2l-4 4M80 2l4 4" strokeWidth="1.5" />
      </>
    ),
  },
  {
    texto: L(<><b>La primera vez solo moja.</b> Espera que se vaya y repite: <b>con la segunda, toca Empezar</b>.</>,
      <><b>The first time only wets the soil.</b> Wait for it to soak in and repeat: <b>on the second time, tap Start</b>.</>),
    dibujo: (
      <>
        {SUELO}{LATA}
        <ellipse className="agua-baja" cx="80" cy="54" rx="22" ry="4.5" fill="var(--lluvia)" stroke="none" />
        <circle cx="132" cy="32" r="15" fill="var(--superficie)" />
        <path d="M132 13v4M128 13h8M132 32l7-6" />
        <text x="24" y="34" className="dos">{L('2.ª', '2nd')}</text>
      </>
    ),
  },
  {
    texto: L(<><b>Cuando la tierra ya no brille</b>, toca Listo. Puede tardar de 5 minutos a más de una hora.</>,
      <><b>When the soil stops shining</b>, tap Done. It can take from 5 minutes to more than an hour.</>),
    dibujo: (
      <>
        {SUELO}{LATA}
        <ellipse cx="80" cy="56" rx="22" ry="4.5" fill="var(--laterita)" stroke="none" opacity="0.55" />
        <circle cx="132" cy="30" r="14" fill="var(--hoja)" stroke="none" />
        <path d="M125 30l5 5 9-10" stroke="var(--sobre-hoja)" strokeWidth="3" />
      </>
    ),
  },
]

/** Con el dedo se desliza; con mouse, las flechas. El contador sigue al scroll, no al revés. */
export function GuiaLata() {
  const lista = useRef<HTMLOListElement>(null)
  const [i, setI] = useState(0)
  const ir = (n: number) => {
    const el = lista.current?.children[Math.max(0, Math.min(PASOS.length - 1, n))] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
  }
  const alDeslizar = () => {
    const g = lista.current
    if (!g) return
    const centro = g.scrollLeft + g.clientWidth / 2
    const hijos = [...g.children] as HTMLElement[]
    setI(hijos.reduce((m, h, k) => Math.abs(h.offsetLeft + h.offsetWidth / 2 - centro) < Math.abs(hijos[m].offsetLeft + hijos[m].offsetWidth / 2 - centro) ? k : m, 0))
  }
  return (
    <div className="guia-marco">
      <ol className="guia" ref={lista} onScroll={alDeslizar} aria-label={L('La prueba de la lata, paso a paso', 'The can test, step by step')}>
        {PASOS.map((p, k) => (
          <li key={k} aria-current={k === i ? 'step' : undefined}>
            <svg viewBox="0 0 160 110" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p.dibujo}</svg>
            <p><span className="guia-n">{k + 1}</span>{p.texto}</p>
          </li>
        ))}
      </ol>
      <div className="guia-control">
        <button className="icono-btn" onClick={() => ir(i - 1)} disabled={i === 0} aria-label={L('Paso anterior', 'Previous step')}><Icono n="atras" /></button>
        <span className="guia-puntos" aria-live="polite">{PASOS.map((_, k) => <i key={k} data-activo={k === i} />)}<span className="sr">{L(<>Paso {i + 1} de {PASOS.length}</>, <>Step {i + 1} of {PASOS.length}</>)}</span></span>
        <button className="icono-btn derecha" onClick={() => ir(i + 1)} disabled={i === PASOS.length - 1} aria-label={L('Paso siguiente', 'Next step')}><Icono n="atras" /></button>
      </div>
    </div>
  )
}
