import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { L } from './i18n'

/* La idea de la app en una escena: el mismo año sobre dos pedazos de suelo.
   Verano (dic–abr): el pelado se agrieta, el tapado guarda la humedad bajo las hojas.
   Lluvias (may–nov): al pelado el aguacero le arrastra la tierra; en el tapado el agua entra y las matas crecen.
   Arriba pasa el satélite: es lo que la app lee de la NASA. */

const NOMBRE_MES = L(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])
const esSeco = (m: number) => m <= 3 || m === 11
const SUELO = 128
const muelle = { type: 'spring', bounce: 0, duration: 0.6 } as const

export function useMes(paso = 850) {
  const quieto = useReducedMotion()
  const [mes, setMes] = useState(quieto ? 6 : 0)
  useEffect(() => {
    if (quieto) return
    const t = setInterval(() => setMes((m) => (m + 1) % 12), paso)
    return () => clearInterval(t)
  }, [quieto, paso])
  return mes
}

export function Escena({ mes }: { mes: number }) {
  const seco = esSeco(mes)
  // en lluvias las matas del lado tapado crecen mes a mes; en verano se quedan medianas bajo su capa de hojas
  const crece = seco ? 0.4 : Math.min(1, 0.6 + (mes - 4) * 0.08)
  return (
    <figure className="escena-fig">
      <svg viewBox="0 0 320 190" role="img" aria-label={L('El mismo año en dos pedazos de suelo: el pelado se agrieta en verano y el aguacero le arrastra la tierra; el tapado con hojas guarda la humedad y las matas crecen.', 'The same year on two patches of soil: the bare one cracks in the dry season and heavy rain washes its soil away; the one covered with dry leaves keeps its moisture and the plants grow.')}>
        {/* cielo */}
        <rect x="0" y="0" width="320" height={SUELO + 6} rx="14" fill="var(--cielo-lluvia)" />
        <motion.rect x="0" y="0" width="320" height={SUELO + 6} rx="14" fill="var(--cielo-seco)" initial={false} animate={{ opacity: seco ? 1 : 0 }} transition={muelle} />
        <g className="satelite" aria-hidden="true">
          <path d="M0 0 L-22 110 L22 110 Z" fill="var(--superficie)" opacity="0.18" />
          <rect x="-5" y="-4" width="10" height="8" rx="1.5" fill="var(--tinta)" />
          <rect x="-17" y="-2.5" width="10" height="5" fill="var(--lluvia)" />
          <rect x="7" y="-2.5" width="10" height="5" fill="var(--lluvia)" />
        </g>
        <AnimatePresence>
          {seco ? (
            <motion.g key="sol" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={muelle} style={{ transformOrigin: '160px 46px' }}>
              <g className="rayos" stroke="var(--seco)" strokeWidth="3" strokeLinecap="round">
                {Array.from({ length: 8 }, (_, i) => <path key={i} d="M160 18v-8" transform={`rotate(${i * 45} 160 46)`} />)}
              </g>
              <circle cx="160" cy="46" r="17" fill="var(--seco)" />
            </motion.g>
          ) : (
            <motion.g key="nube" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={muelle}>
              <path d="M112 50a16 16 0 0 1 30-9 20 20 0 0 1 38 4 13 13 0 0 1 2 26h-66a12 12 0 0 1-4-21Z" fill="var(--nube)" />
              <g className="lluvia-cae" stroke="var(--lluvia)" strokeWidth="2.5" strokeLinecap="round">
                {[40, 70, 100, 130, 190, 220, 250, 280].map((x, i) => <path key={x} d={`M${x} 78l-3 9`} style={{ animationDelay: `${i * 110}ms` }} />)}
              </g>
            </motion.g>
          )}
        </AnimatePresence>

        {/* suelo pelado */}
        <rect x="0" y={SUELO} width="156" height={190 - SUELO} rx="6" fill="var(--laterita)" opacity="0.85" />
        <motion.path d="M18 128l6 9-4 7M60 128l-3 8 6 6M104 128l5 10-5 5M138 128l-4 9" stroke="var(--humus)" strokeWidth="2" fill="none"
          animate={{ opacity: seco ? 1 : 0, pathLength: seco ? 1 : 0 }} transition={muelle} />
        <motion.g animate={{ opacity: seco ? 0 : 1 }} transition={muelle}>
          <g className="salpica" fill="var(--laterita)">{[30, 72, 116].map((x) => <circle key={x} cx={x} cy={SUELO - 6} r="2.6" />)}</g>
          <path className="arrastre" d="M150 136q-40 14-140 18" stroke="var(--humus)" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="6 7" />
        </motion.g>

        {/* suelo tapado */}
        <rect x="164" y={SUELO} width="156" height={190 - SUELO} rx="6" fill="var(--humus)" opacity="0.9" />
        <motion.g animate={{ opacity: seco ? 0 : 1 }} transition={muelle}>
          <g className="entra" stroke="var(--lluvia)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 6">
            {[190, 236, 282].map((x) => <path key={x} d={`M${x} 134v30`} />)}
          </g>
        </motion.g>
        <g fill="var(--hoja)">
          {[184, 226, 268, 306].map((x, i) => (
            <motion.g key={x} style={{ transformOrigin: `${x}px ${SUELO}px` }} initial={false} animate={{ scale: crece }} transition={{ type: 'spring', bounce: 0.3, duration: 0.7, delay: i * 0.05 }}>
              <path d={`M${x} ${SUELO}v-34`} stroke="var(--hoja)" strokeWidth="3" />
              <path d={`M${x} ${SUELO - 22}c0-10 7-16 17-16 0 10-7 16-17 16ZM${x} ${SUELO - 14}c0-8-6-13-14-13 0 8 6 13 14 13Z`} />
            </motion.g>
          ))}
        </g>
        <g fill="var(--rastrojo)">{Array.from({ length: 13 }, (_, i) => <ellipse key={i} cx={170 + i * 11.5} cy={SUELO - 2 + (i % 2)} rx="7" ry="3" transform={`rotate(${(i * 37) % 30 - 15} ${170 + i * 11.5} ${SUELO})`} />)}</g>

        <text x="78" y="182" textAnchor="middle" className="esc-etq">{L('Suelo pelado', 'Bare soil')}</text>
        <text x="242" y="182" textAnchor="middle" className="esc-etq">{L('Tapado con hojas', 'Covered with dry leaves')}</text>
      </svg>
      <figcaption>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={mes} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}>
            {NOMBRE_MES[mes]}
          </motion.span>
        </AnimatePresence>
        <b>{seco ? L('verano', 'dry season') : L('lluvias', 'rainy season')}</b>
      </figcaption>
    </figure>
  )
}
