import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { L } from './i18n'
import './escena.css'

/* La idea de la app en un dibujo: el mismo año sobre UN terreno, partido en dos mitades y visto en corte.
   Izquierda, suelo pelado: en verano se agrieta y se seca por dentro; con el aguacero salpica, el agua corre
   por encima arrastrando tierra hacia el borde y casi nada entra.
   Derecha, tapado con hojas: el agua entra y baja por el perfil, que se oscurece con la humedad y las raíces;
   en verano la humedad se guarda bajo las hojas y en lluvias las matas crecen.
   En medio, un pluviómetro marca la misma lluvia para las dos mitades. Arriba cruza un satélite: es la NASA mirando.

   Vista: corte frontal con un filo del terreno detrás. A 320–480 px de ancho lo que cuenta la idea está bajo
   tierra (grietas, frente de humedad, raíces) y necesita todo el ancho; un isométrico gastaría la mitad del alto
   en la cara de arriba y aplastaría el perfil en una diagonal. */

const NOMBRE_MES = L(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])
const esSeco = (m: number) => m <= 3 || m === 11
/* Forma aproximada de la lluvia mensual en el Pacífico de Panamá (relativa al mes más lluvioso). Solo mueve el
   nivel del pluviómetro: no es un dato que la app muestre. */
const LLUVIA_REL = [0.06, 0.03, 0.04, 0.2, 0.66, 0.7, 0.56, 0.64, 0.72, 0.92, 0.8, 0.3]

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

/* ------------------------------------------------------------------ geometría (se calcula una sola vez) */

type P = [number, number]
const W = 320, H = 220
const V = { x0: 6, y0: 6, x1: 314, y1: 200, r: 8 } // ventana del marco
const MEDIO = 160
const f = (n: number) => Math.round(n * 100) / 100
const linea = (p: P[]) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('')
const cerrada = (p: P[]) => linea(p) + 'Z'
const rango = (a: number, b: number, paso: number) => { const r: number[] = []; for (let x = a; x < b - 1e-6; x += paso) r.push(x); r.push(b); return r }
const suave = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function azar(semilla: number) {
  let a = semilla >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** puntos de una curva cuadrática */
const curva = (a: P, c: P, b: P, n = 10): P[] => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]
})
/** contorno relleno alrededor de una línea, con el grueso de w0 a w1: raíces, tallos, grietas. Termina en punta, no en corte. */
function ahusado(p: P[], w0: number, w1: number) {
  const largos = [0]
  for (let i = 1; i < p.length; i++) largos.push(largos[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
  const total = largos[largos.length - 1] || 1
  const a: P[] = [], b: P[] = []
  p.forEach((q, i) => {
    const s = p[Math.max(0, i - 1)], e = p[Math.min(p.length - 1, i + 1)]
    const tx = e[0] - s[0], ty = e[1] - s[1], n = Math.hypot(tx, ty) || 1
    const w = lerp(w0, w1, largos[i] / total) / 2
    a.push([q[0] - (ty / n) * w, q[1] + (tx / n) * w]); b.push([q[0] + (ty / n) * w, q[1] - (tx / n) * w])
  })
  return cerrada([...a, ...b.reverse()])
}

/* El terreno baja un poco hacia la izquierda: por ahí se va el agua que no entra. */
const ys = (x: number) => 110 - 0.02 * x
const BANDA = 9 // lo que se ve del terreno detrás del corte
const yb = (x: number) => ys(x) - BANDA
const rugoso = (x: number) => (0.55 * Math.sin(x * 0.71) + 0.4 * Math.sin(x * 1.93 + 0.6)) * (1 - suave(MEDIO - 16, MEDIO, x))
const SURCO = 19 // donde el agua que escurre ya abrió una zanja, junto al borde
const zanja = (x: number) => 4.6 * Math.exp(-(((x - SURCO) / 8.5) ** 2))
const sup = (x: number) => ys(x) + rugoso(x) + zanja(x) // superficie en el corte: costrosa del lado pelado, lisa bajo las hojas
const yA = (x: number) => ys(x) + 23 + 9 * suave(120, 200, x) + 1.1 * Math.sin(x / 21) + 0.7 * Math.sin(x / 8.3 + 1.3) // fin de la capa de arriba: más delgada donde se la lleva el agua
const XS = rango(-2, 322, 2)
const ABAJO = 204

const D_CORTE = cerrada([...XS.map((x): P => [x, sup(x)]), [322, ABAJO], [-2, ABAJO]])
const D_CAPA_A = cerrada([...XS.map((x): P => [x, sup(x)]), ...[...XS].reverse().map((x): P => [x, yA(x)])])
const D_LIMITE_AB = linea(XS.map((x): P => [x, yA(x)]))
const D_BANDA = cerrada([...XS.map((x): P => [x, yb(x)]), ...[...XS].reverse().map((x): P => [x, sup(x) + 0.2])])
const D_CANTO_PELADO = linea(rango(-2, MEDIO - 2, 2).map((x): P => [x, sup(x) - 0.3]))

/* Lomas al fondo: la lejana lisa, la cercana con copas de árboles. */
const D_LOMA_LEJOS = cerrada([[-2, 150], ...rango(-2, 322, 6).map((x): P => [x, 80 - 6 * Math.sin(x / 47 + 0.8) - 3 * Math.sin(x / 19)]), [322, 150]])
const D_LOMA_CERCA = (() => {
  const p: P[] = [[-2, 150]]
  for (const x of rango(-2, 322, 3)) p.push([x, 93 - 3.4 * Math.sin(x / 31 + 2) - 1.6 * Math.abs(Math.sin(x / 4.6)) - 1.2 * Math.abs(Math.sin(x / 2.3 + 1))])
  p.push([322, 150])
  return cerrada(p)
})()

/* Grietas del verano: cuñas en el corte que siguen como líneas sobre el terreno, hacia el fondo. */
const FUGA: P = [MEDIO, 20] // punto de fuga del terreno
const FUGA_X = MEDIO
const haciaFondo = (x: number, h: number): P => { const y0 = sup(x); return [x + ((FUGA[0] - x) * h) / (y0 - FUGA[1]), y0 - h] }
const GRIETAS = [
  { x: 23, w: 3.8, d: 17, j: 1.2 }, { x: 54, w: 4.6, d: 23, j: -1.4 }, { x: 87, w: 3.2, d: 15, j: 1 },
  { x: 119, w: 4.8, d: 21, j: -1.1 }, { x: 145, w: 2.8, d: 11, j: 0.8 },
].map(({ x, w, d, j }, i) => {
  const r = azar(11 + i)
  const lados = (s: 1 | -1) => [0, 0.22, 0.45, 0.7].map((t): P => [x + j * t * 2 + s * (w / 2) * Math.pow(1 - t, 0.85) + (r() - 0.5) * 0.7 * t, sup(x) + d * t - (t === 0 ? 0.6 : 0)])
  const izq = lados(-1), der = lados(1)
  const punta: P = [x + j * 2, sup(x) + d]
  const cuña = cerrada([...izq, punta, ...der.reverse()])
  const labio = linea([izq[0], izq[1], izq[2]])
  // ramitas finas que salen de la cuña y terminan en punta
  const rama = (t: number, s: 1 | -1, largo: number) => {
    const a: P = [x + j * t * 2 + s * (w / 2) * Math.pow(1 - t, 0.85) * 0.8, sup(x) + d * t]
    return ahusado(curva(a, [a[0] + s * largo * 0.5, a[1] + largo * 0.25], [a[0] + s * largo, a[1] + largo * 0.7], 6), 0.9, 0)
  }
  const ramas = [rama(0.35, i % 2 ? 1 : -1, 5 + r() * 2), rama(0.55, i % 2 ? -1 : 1, 4 + r() * 2)]
  // sobre el terreno: la grieta se angosta al alejarse
  const arriba: P[] = [0, 3, 6, BANDA].map((h, k) => { const q = haciaFondo(x, h); return [q[0] + (k === 1 || k === 2 ? (r() - 0.5) * 2.4 : 0), q[1]] })
  return { x, cuña, labio, ramas, arriba, wTop: w }
})
const BANDA_GRIETAS = GRIETAS.map((g) => ahusado(g.arriba, g.wTop * 0.75, 0.5))
/* grietas que cruzan de una línea a la otra: terminan sobre ellas */
const enLinea = (p: P[], h: number): P => { const k = h / BANDA * (p.length - 1), i = Math.min(p.length - 2, Math.floor(k)), t = k - i; return [lerp(p[i][0], p[i + 1][0], t), lerp(p[i][1], p[i + 1][1], t)] }
const BANDA_CRUCES = GRIETAS.slice(0, -1).flatMap((g, i) => {
  const h = i % 2 ? 6.4 : 3.2
  const a = enLinea(g.arriba, h), b = enLinea(GRIETAS[i + 1].arriba, h + (i % 2 ? -0.8 : 0.9))
  const out = [ahusado(curva(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.9], b, 8), 0.75, 0.75)]
  if (i % 2 === 0) { const c = enLinea(g.arriba, 7.6), e = enLinea(GRIETAS[i + 1].arriba, 7.2); out.push(ahusado(curva(c, [(c[0] + e[0]) / 2, c[1] + 0.5], e, 8), 0.5, 0.5)) }
  return out
})
/* láminas de suelo apretado entre grietas (estructura laminar del suelo pelado) */
const LAMINAS = [[29, 49, 9], [60, 83, 12], [92, 115, 7.5], [124, 141, 10], [36, 50, 14.5], [96, 113, 13]].map(([a, b, h]) =>
  linea(rango(a, b, 2).map((x): P => [x, sup(x) + h + 0.4 * Math.sin(x / 3)])))

/* Hojarasca: hojas secas en corte sobre la mitad derecha, en tres filas; y sobre el terreno, achatadas por la distancia. */
type HojaSeca = { x: number; y: number; l: number; g: number; a: number; tono: 1 | 2 | 3 | 4; curva?: boolean }
const HOJARASCA: HojaSeca[] = (() => {
  const r = azar(7), out: HojaSeca[] = []
  for (const [fila, dy, tonos] of [[0, -1.4, [1, 4, 1]], [1, -3.7, [2, 4, 1, 3]], [2, -5.9, [3, 2, 3, 4]]] as const) {
    for (let x = 163 + fila * 3.2; x < 318; x += 7.2 + r() * 3) {
      out.push({ x, y: ys(x) + dy + (r() - 0.5) * 0.7, l: 11 + r() * 5, g: 2.2 + r() * 1, a: (r() - 0.5) * 16, tono: tonos[Math.floor(r() * tonos.length)], curva: fila === 2 && r() < 0.3 })
    }
  }
  return out
})()
const hojaSecaD = (h: HojaSeca) => {
  const { l, g } = h
  if (h.curva) return `M${f(-l / 2)} 0Q0 ${f(-g * 2.2)} ${f(l / 2)} 0Q0 ${f(-g * 1.1)} ${f(-l / 2)} 0Z` // hoja enrollada: media luna
  return `M${f(-l / 2)} 0C${f(-l / 4)} ${f(-g)} ${f(l / 4)} ${f(-g)} ${f(l / 2)} 0C${f(l / 4)} ${f(g * 0.8)} ${f(-l / 4)} ${f(g * 0.8)} ${f(-l / 2)} 0Z`
}
const HOJARASCA_FONDO = (() => {
  const r = azar(5), out: { x: number; y: number; rx: number; ry: number; a: number; tono: number }[] = []
  for (let k = 0; k < 34; k++) {
    const h = 1 + r() * (BANDA - 1.6), x = 165 + r() * 152, prof = 1 - h / BANDA
    out.push({ x, y: ys(x) - h, rx: 1.6 + prof * 2.8 + r(), ry: 0.5 + prof * 0.7, a: (r() - 0.5) * 30, tono: 1 + Math.floor(r() * 4) })
  }
  return out.sort((a, b) => a.y - b.y)
})()

/* Charcos y marcas del agua que corre sobre el lado pelado */
const CHARCOS = [[28, 2.4, 7], [66, 5.6, 5], [104, 3.4, 8], [138, 6.4, 4.5]].map(([x, h, rx]) => { const [cx, cy] = haciaFondo(x, h); return { cx, cy, rx: rx * (1 - h / 22), ry: 0.75 } })

/* Lámina de agua que escurre por el borde del corte hacia la izquierda, más gruesa y más turbia abajo. */
const grueso = (x: number) => 1.5 + 3.4 * Math.pow(Math.max(0, (150 - x) / 146), 1.1)
/** tope del agua: una lámina que engorda hacia el borde y llena la zanja */
const agua = (x: number) => Math.min(ys(x) - grueso(x) * suave(156, 136, x), sup(x) - 0.3)
const D_ESCURRE = (() => {
  const xs = rango(-2, 152, 2)
  return cerrada([...xs.map((x): P => [x, agua(x)]), [154, sup(154)], ...[...xs].reverse().map((x): P => [x, sup(x) + 0.35])])
})()
const D_ESCURRE_BRILLO = linea(rango(-2, 140, 2).map((x): P => [x, agua(x) + 0.4]))
/* la zanja sigue hacia el fondo, y los hilos de agua turbia bajan a ella */
const D_ZANJA_FONDO = ahusado([0, 3, 6, BANDA].map((h) => { const [x, y] = [SURCO + ((FUGA_X - SURCO) * h) / 90, ys(SURCO) - h]; return [x, y] as P }), 9, 2.5)
const HILOS = [[44, 7.6], [76, 5.2], [104, 8.2], [132, 4]].map(([x0, h]) => ahusado(curva([x0 + ((FUGA_X - x0) * h) / 90, ys(x0) - h], [lerp(x0, SURCO, 0.45), ys(x0) - h * 0.2], [SURCO + 3, ys(SURCO) - 0.8], 12), 0.5, 2.2))

/* Suelo: piedras, manchas de hierro, grumos y poros */
const PIEDRAS = [[18, 178, 4.2, 2.8], [71, 189, 5.5, 3.3], [131, 166, 3.4, 2.4], [196, 186, 5, 3], [252, 193, 3.6, 2.5], [300, 171, 4.4, 2.9], [104, 196, 3.2, 2.1], [226, 164, 2.6, 1.9], [44, 158, 2.8, 1.9], [281, 150, 3, 2], [168, 156, 2.4, 1.7]]
const MANCHAS = (() => {
  const r = azar(3)
  return Array.from({ length: 24 }, (_, k) => {
    const x = 4 + r() * 312, y = 146 + r() * 54, rx = 2.4 + r() * 4.6, ry = 1.1 + r() * 1.9
    const d = cerrada(Array.from({ length: 9 }, (_, i): P => { const a = (i / 9) * Math.PI * 2, q = 0.72 + r() * 0.42; return [x + Math.cos(a) * rx * q, y + Math.sin(a) * ry * q] }))
    return { d, tono: (['esc-mancha', 'esc-mancha-luz', 'esc-mancha-ocre'] as const)[k % 3] }
  })
})()
const CONCRECIONES = (() => { const r = azar(9); return Array.from({ length: 26 }, () => { const x = 4 + r() * 312; return { x, y: lerp(yA(x) + 4, 199, r()), r: 0.35 + r() * 0.45 } }) })()
const GRUMOS = (() => {
  const r = azar(21), out: string[] = []
  for (let k = 0; k < 26; k++) {
    const x = 166 + r() * 146, y = lerp(ys(x) + 3, yA(x) - 2, r()), rr = 1.1 + r() * 1.3
    out.push(cerrada(Array.from({ length: 7 }, (_, i): P => { const a = (i / 7) * Math.PI * 2, q = rr * (0.75 + r() * 0.4); return [x + Math.cos(a) * q, y + Math.sin(a) * q * 0.8] })))
  }
  return out
})()
const POROS = (() => {
  const r = azar(33), out: { x: number; y: number; r: number }[] = []
  for (let k = 0; k < 18; k++) { const x = 164 + r() * 150; out.push({ x, y: lerp(ys(x) + 3, yA(x) + 10, r()), r: 0.25 + r() * 0.3 }) }
  for (let k = 0; k < 7; k++) { const x = 10 + r() * 140; out.push({ x, y: lerp(sup(x) + 4, yA(x), r()), r: 0.3 + r() * 0.3 }) }
  return out
})()

/* Lombriz en su galería (mitad tapada): la galería baja hasta el subsuelo */
const LOMBRIZ_CUERPO: P[] = [...curva([247, ys(247) + 17], [252, ys(252) + 11], [258, ys(258) + 16], 8), ...curva([258, ys(258) + 16], [264, ys(264) + 21.5], [270, ys(270) + 15.5], 8).slice(1)]
const LOMBRIZ_GALERIA = ahusado([...curva([241, ys(241) + 0.5], [240, ys(240) + 12], [247, ys(247) + 17], 8), ...LOMBRIZ_CUERPO.slice(1), ...curva([270, ys(270) + 15.5], [276, ys(276) + 12], [278, ys(278) + 30], 10).slice(1)], 3.4, 1.2)
const LOMBRIZ_ANILLOS = LOMBRIZ_CUERPO.slice(2, -2).map((q, i, arr) => {
  const s = arr[Math.max(0, i - 1)], e = arr[Math.min(arr.length - 1, i + 1)], tx = e[0] - s[0], ty = e[1] - s[1], n = Math.hypot(tx, ty) || 1
  const w = 1.15
  return linea([[q[0] - (ty / n) * w, q[1] + (tx / n) * w], [q[0] + (ty / n) * w, q[1] - (tx / n) * w]])
})

/* Raíces: raíz principal y laterales que terminan en punta. Del lado pelado se quedan cortas y de lado, bajo la costra. */
function raices(x: number, y: number, hondo: number, ancho: number, semilla: number) {
  const r = azar(semilla), out: string[] = []
  const fin: P = [x + (r() - 0.5) * 4, y + hondo]
  out.push(ahusado(curva([x, y], [x + (r() - 0.5) * 5, y + hondo * 0.5], fin, 14), 1.5, 0))
  const n = 5
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (i / n) * 0.7, s = i % 2 ? 1 : -1
    const a: P = [lerp(x, fin[0], t), y + hondo * t]
    const largo = ancho * (1 - t * 0.6) * (0.75 + r() * 0.4)
    const b: P = [a[0] + s * largo, a[1] + largo * (0.35 + r() * 0.4)]
    out.push(ahusado(curva(a, [a[0] + s * largo * 0.55, a[1] + 0.5], b, 10), 0.9, 0))
    const m: P = [lerp(a[0], b[0], 0.55), lerp(a[1], b[1], 0.45)]
    out.push(ahusado(curva(m, [m[0] + s * 2, m[1] + 2], [m[0] + s * (2.5 + r() * 2), m[1] + 4 + r() * 2], 6), 0.5, 0))
  }
  return out
}
const RAICES_TAPADO = [[190, 34, 13, 41], [238, 40, 15, 43], [287, 31, 12, 47]].flatMap(([x, h, w, s]) => raices(x, ys(x) + 0.5, h, w, s))
const RAICES_PELADO = [[52, 7, 9, 51], [116, 8, 10, 53]].flatMap(([x, h, w, s]) => raices(x, sup(x) + 0.5, h, w, s))

/* Frente de humedad del lado tapado: más hondo bajo las matas y la galería, donde el agua baja más rápido.
   Se dibuja "a nivel" (arriba plano, justo bajo el canto) y la capa lo pone en la pendiente del terreno con un skewY:
   así crece y se encoge con un scaleY del compositor sin despegarse de la superficie. */
const lobulos = (x: number) => [190, 238, 287, 266, 214].reduce((s, c, i) => s + (i > 2 ? 0.6 : 1) * Math.exp(-(((x - c) / 12) ** 2)), 0)
const HUM_X0 = 162, HUM_Y0 = ys(HUM_X0) + 0.2
const D_HUMEDO = (() => {
  const xs = rango(HUM_X0, 322, 1.5)
  const hondo = (x: number) => (52 + 12 * lobulos(x) + 1.4 * Math.sin(x / 4.1) + 1.6 * Math.sin(x / 9.7 + 2)) * Math.sqrt(suave(HUM_X0, 190, x))
  return cerrada([...xs.map((x): P => [x, HUM_Y0]), ...[...xs].reverse().map((x): P => [x, HUM_Y0 + Math.max(0.5, hondo(x))])])
})()
/* La piel mojada del lado pelado: el agua apenas entra unos milímetros */
const D_PIEL = (() => {
  const xs = rango(-2, 160, 2)
  return cerrada([...xs.map((x): P => [x, sup(x) - 0.2]), ...[...xs].reverse().map((x): P => [x, sup(x) + (5.2 + 1 * Math.sin(x / 6.3) + zanja(x) * 0.6) * (1 - suave(146, 160, x))])])
})()

/* ------------------------------------------------------------------ piezas */

type Hoja = { s: number; lado: 1 | -1; ang: number; l: number; a: number }
const MATA_GRANDE: Hoja[] = [
  { s: 0.26, lado: -1, ang: -16, l: 12, a: 5 }, { s: 0.42, lado: 1, ang: -26, l: 13, a: 5.3 }, { s: 0.58, lado: -1, ang: -34, l: 11.5, a: 4.8 },
  { s: 0.74, lado: 1, ang: -42, l: 10, a: 4.3 }, { s: 0.88, lado: -1, ang: -56, l: 7, a: 3.1 }, { s: 1, lado: 1, ang: -70, l: 5, a: 2.2 },
]
const MATA_MUSTIA: Hoja[] = [
  { s: 0.38, lado: -1, ang: 12, l: 7, a: 2.7 }, { s: 0.6, lado: 1, ang: 6, l: 7.5, a: 2.8 }, { s: 0.82, lado: -1, ang: -16, l: 5.5, a: 2.2 }, { s: 1, lado: 1, ang: -40, l: 3.8, a: 1.6 },
]
function Mata({ x, y, alto, inclina, hojas, espejo = false }: { x: number; y: number; alto: number; inclina: number; hojas: Hoja[]; espejo?: boolean }) {
  const tallo = curva([x, y], [x + inclina * 0.2, y - alto * 0.55], [x + inclina, y - alto], 12)
  const en = (s: number) => tallo[Math.round(s * (tallo.length - 1))]
  return (
    <g>
      {hojas.map((h, i) => {
        const [px, py] = en(h.s), lado = espejo ? -h.lado : h.lado
        const peciolo = 2.2, rad = (h.ang * Math.PI) / 180
        const bx = px + lado * Math.cos(rad) * peciolo, by = py + Math.sin(rad) * peciolo
        const { l, a } = h
        return (
          <g key={i}>
            <path className="esc-peciolo" d={`M${f(px)} ${f(py)}L${f(bx)} ${f(by)}`} />
            <g transform={`translate(${f(bx)} ${f(by)}) scale(${lado} 1) rotate(${h.ang})`}>
              <path className="esc-hoja-a" d={`M0 0C${f(l * 0.25)} ${f(-a)} ${f(l * 0.7)} ${f(-a * 0.85)} ${f(l)} 0Z`} />
              <path className="esc-hoja-b" d={`M0 0C${f(l * 0.25)} ${f(a)} ${f(l * 0.7)} ${f(a * 0.85)} ${f(l)} 0Z`} />
              <path className="esc-nervio" d={`M0 0L${f(l)} 0`} />
            </g>
          </g>
        )
      })}
      <path className="esc-tallo" d={ahusado(tallo, 2.1, 0.7)} />
    </g>
  )
}

/** Satélite: cuerpo con manta térmica, dos paneles con celdas, antena y sensor mirando abajo. Centrado en 0,0. */
function Satelite() {
  const panel = (x0: number) => (
    <g>
      <rect className="esc-panel" x={x0} y={-2.6} width={11} height={5.2} rx={0.5} />
      {[1, 2, 3].map((k) => <path key={k} className="esc-celda" d={`M${f(x0 + (11 * k) / 4)} -2.6V2.6`} />)}
      <path className="esc-celda" d={`M${x0} 0H${x0 + 11}`} />
    </g>
  )
  return (
    <g>
      <path className="esc-brazo" d="M-15.5 0H-4.5M4.5 0H15.5" />
      {panel(-26.5)}{panel(15.5)}
      <rect className="esc-sat-oro" x={-4.5} y={-4} width={9} height={8} rx={1} />
      <rect className="esc-sat-oro-sombra" x={1.2} y={-4} width={3.3} height={8} rx={0.6} />
      <path className="esc-celda-oscura" d="M-4.5 -1.2H4.5M-4.5 1.6H4.5" />
      <path className="esc-brazo" d="M0 -4V-6.2" />
      <path className="esc-antena" d="M-2.6 -6.4Q0 -8.4 2.6 -6.4Z" />
      <rect className="esc-sensor" x={-1.6} y={4} width={3.2} height={1.8} rx={0.4} />
    </g>
  )
}

/** Pluviómetro sobre su estaca, en dos pisos: la estaca y el vidrio van detrás de la columna de agua (su propia capa),
    y la escala, los brillos y el embudo, delante. */
const PLUV = { x: MEDIO, y0: 74, y1: 98, r: 3.5 }
function PluviometroFondo() {
  const { x, y0, y1, r } = PLUV
  return (
    <g>
      {/* estaca de madera: cara de frente y un canto con luz */}
      <rect className="esc-madera" x={x - 1.8} y={y0 + 1} width={3.6} height={ys(x) - y0 - 0.5} />
      <rect className="esc-madera-luz" x={x - 1.8} y={y0 + 1} width={0.9} height={ys(x) - y0 - 0.5} />
      <rect className="esc-vidrio" x={x - r} y={y0} width={r * 2} height={y1 - y0} rx={0.8} />
    </g>
  )
}
function PluviometroFrente() {
  const { x, y0, y1, r } = PLUV
  const marcas = rango(y0 + 2, y1 - 1, 2).map((y, i) => <path key={y} className={i % 5 === 0 ? 'esc-marca-mayor' : 'esc-marca'} d={`M${x + r} ${f(y)}h${i % 5 === 0 ? -2.2 : -1.2}`} />)
  return (
    <g>
      <rect className="esc-vidrio-luz" x={x - r + 0.8} y={y0 + 0.8} width={1} height={y1 - y0 - 1.6} rx={0.5} />
      <rect className="esc-vidrio-sombra" x={x + r - 1.4} y={y0 + 0.8} width={0.9} height={y1 - y0 - 1.6} rx={0.45} />
      {marcas}
      <rect className="esc-vidrio-borde" x={x - r} y={y0} width={r * 2} height={y1 - y0} rx={0.8} />
      {/* embudo y aro */}
      <path className="esc-embudo" d={`M${x - 5.6} ${y0 - 4.6}L${x + 5.6} ${y0 - 4.6}L${x + r} ${y0 + 0.4}L${x - r} ${y0 + 0.4}Z`} />
      <path className="esc-embudo-sombra" d={`M${x + 2.4} ${y0 - 4.6}L${x + 5.6} ${y0 - 4.6}L${x + r} ${y0 + 0.4}L${x + 1.6} ${y0 + 0.4}Z`} />
      <ellipse className="esc-aro" cx={x} cy={y0 - 4.6} rx={5.6} ry={1.1} />
      <ellipse className="esc-boca" cx={x} cy={y0 - 4.5} rx={4.4} ry={0.6} />
      {/* base y abrazaderas */}
      <rect className="esc-tapa" x={x - r - 0.4} y={y1 - 0.6} width={r * 2 + 0.8} height={2.2} rx={0.6} />
      {[y0 + 6, y1 - 5].map((y) => (
        <g key={y}>
          <rect className="esc-abrazadera" x={x - r - 0.5} y={y} width={r * 2 + 1} height={1.6} rx={0.4} />
          <circle className="esc-tornillo" cx={x - r + 0.6} cy={y + 0.8} r={0.42} />
          <circle className="esc-tornillo" cx={x + r - 0.6} cy={y + 0.8} r={0.42} />
        </g>
      ))}
    </g>
  )
}

/* Gotas, salpicaduras y la tierra que arrastra el agua */
const SALPICA = [36, 84, 132].map((x, i) => ({ x, y: agua(x), d: -i * 0.36 - 0.1 }))
const GOTITAS: { dx: number; dy: number; r: number }[] = [{ dx: -6, dy: -5.5, r: 1 }, { dx: 0.6, dy: -9.4, r: 0.75 }, { dx: 6.2, dy: -5, r: 0.85 }]
const CORRIENTE = [[30, 0], [60, -0.5], [96, -0.9], [126, -0.3]].map(([x, d]) => ({ x, d }))
const ARRASTRE = [[18, 0, 1.1], [40, -1.1, 0.9], [63, -0.4, 1.2], [88, -1.8, 0.9], [112, -0.9, 1], [52, -1.7, 1]].map(([x, d, r]) => ({ x, d, r }))
const ENTRA = [[176, 9, 0], [197, 21, -0.6], [222, 15, -1.3], [250, 17, -1.9], [266, 27, -1], [296, 14, -1.6]].map(([x, h, d]) => ({ x, y: ys(x) + h, d }))
const FRENA = [[58, 0], [124, -1.1]].map(([x, d]) => ({ x, y: sup(x) + 1.4, d }))
const VAPOR = [[36, 0], [78, -1.5], [122, -2.8]].map(([x, d]) => ({ x, y: yb(x) + 1, d }))
const GOTA = 'M0 -2.1C0.7 -1 1.05 -0.2 1.05 0.45A1.05 1.05 0 0 1 -1.05 0.45C-1.05 -0.2 -0.7 -1 0 -2.1Z'

/* Nubes: tres tonos (sombra abajo, cuerpo, luz arriba) hechos de círculos del mismo color, sin contorno. */
type Nub = { c: [number, number, number][]; x0: number; x1: number; base: number }
const NUBE_GRANDE: Nub = { c: [[102, 48, 6], [118, 45, 9], [136, 38, 15], [158, 33, 19], [182, 36, 17], [204, 41, 13], [224, 45, 9], [242, 48, 6]], x0: 96, x1: 248, base: 54 }
const NUBE_CHICA: Nub = { c: [[30, 51, 5], [42, 47, 9], [56, 49, 7], [68, 52, 4]], x0: 25, x1: 72, base: 56 }
/** Nube con volumen: la silueta recorta tres tonos. Luz arriba a la izquierda (de donde viene el sol), cuerpo, y la panza en sombra. */
function Nube({ n, clip }: { n: Nub; clip: string }) {
  const silueta = (dx: number, dy: number) => <>{n.c.map(([x, y, r], i) => <circle key={i} cx={x + dx} cy={y + dy} r={r} />)}<rect x={n.x0 + dx} y={n.base - 8 + dy} width={n.x1 - n.x0} height={8} rx={4} /></>
  return (
    <g>
      <clipPath id={clip}>{silueta(0, 0)}</clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect className="esc-nube-luz" x={n.x0 - 20} y={0} width={n.x1 - n.x0 + 40} height={n.base + 2} />
        <g className="esc-nube">{silueta(1.6, 2.4)}</g>
        <path className="esc-nube-sombra" d={`M${n.x0 - 2} ${n.base}V${n.base - 4.2}${rango(n.x0, n.x1, 4).map((x) => `L${x} ${f(n.base - 4.2 - 0.9 * Math.sin(x / 5))}`).join('')}V${n.base}Z`} />
      </g>
    </g>
  )
}

/* ------------------------------------------------------------------ capas
   Rendimiento: el navegador vuelve a pintar un SVG entero cuando algo cambia adentro, y con todo en uno (1.200 nodos,
   degradados, recortes) un Android de gama media se quedaba en 10–15 fps. Por eso el dibujo va en capas apiladas que
   comparten coordenadas (cada <svg> recorta su caja del mismo sistema de 320×220):
   - lo quieto se pinta una sola vez (esc-fija);
   - lo que cambia con la estación o el mes se funde o se escala con transiciones CSS sobre el <svg> entero, que corren
     en el compositor sin volver a pintar (esc-fundido, esc-crece);
   - lo que se mueve en bucle también anima el <svg> entero (satélite, nubes, lluvia, vaho, halo), y lo poco que se
     mueve por dentro (salpicaduras, gotas que entran) vive en capas chicas de pocos nodos (esc-bucle).
   El orden de las capas es el orden de pintado del dibujo de antes. */

type Caja = { x: number; y: number; w: number; h: number }
const TODO: Caja = { x: 0, y: 0, w: W, h: H }
const pct = (n: number) => `${f(n * 100)}%`
const enCaja = (b: Caja, p: Caja = TODO): CSSProperties => ({ left: pct((b.x - p.x) / p.w), top: pct((b.y - p.y) / p.h), width: pct(b.w / p.w), height: pct(b.h / p.h) })
const origen = (b: Caja, x: number, y: number) => `${pct((x - b.x) / b.w)} ${pct((y - b.y) / b.h)}`

function Capa({ caja, padre, className = '', style, children }: { caja: Caja; padre?: Caja; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <svg className={`esc-capa ${className}`} viewBox={`${f(caja.x)} ${f(caja.y)} ${f(caja.w)} ${f(caja.h)}`} preserveAspectRatio="none"
      style={{ ...enCaja(caja, padre), ...style }} aria-hidden="true" focusable="false">{children}</svg>
  )
}
function Cuadro({ caja, className = '', style, children }: { caja: Caja; className?: string; style?: CSSProperties; children: ReactNode }) {
  return <div className={`esc-cuadro ${className}`} style={{ ...enCaja(caja), ...style }}>{children}</div>
}
const parada = (o: number, c: string, a = 1) => <stop offset={o} style={{ stopColor: c, stopOpacity: a }} />
const parar = (s: { d: number }) => ({ animationDelay: `${s.d}s` })
const hojaSeca = (h: HojaSeca, i: number) => (
  <g key={i} transform={`translate(${f(h.x)} ${f(h.y)}) rotate(${f(h.a)})`}>
    <path className={`esc-hojarasca-${h.tono}`} d={hojaSecaD(h)} />
    {!h.curva && <path className="esc-hojarasca-nervio" d={`M${f(-h.l / 2)} 0L${f(h.l / 2)} 0`} />}
  </g>
)

const CIELO: Caja = { x: V.x0, y: V.y0, w: V.x1 - V.x0, h: 108 }
const HALO: Caja = { x: 78, y: 6, w: 68, h: 68 }
const SOL: Caja = { x: 91, y: 19, w: 42, h: 42 }
// las órbitas (escena.css) mueven estas cajas en % de su propio ancho: de x−262 a x+110, como antes
const SAT: Caja = { x: 209, y: 6, w: 54, h: 17 }
const HAZ: Caja = { x: 219, y: 20, w: 34, h: f(yb(236) + 1 - 20) }
const HUELLA: Caja = { x: 218, y: f(yb(236) + 1.2), w: 36, h: 4.8 }
const NUBES: Caja = { x: 18, y: 12, w: 242, h: 46 }
const BANDA_C: Caja = { x: V.x0, y: 94, w: V.x1 - V.x0, h: 22 }
const MEDIO_C: Caja = { x: V.x0, y: 84, w: V.x1 - V.x0, h: V.y1 - 84 }
const VAHO: Caja = { x: 28, y: 75, w: 104, h: 33 }
const PALIDEZ: Caja = { x: V.x0, y: 102, w: MEDIO - 1.8 - V.x0, h: 40 } // hasta la estaca: lo que hay a su derecha no se aclara
const PIEL: Caja = { x: V.x0, y: 100, w: 156, h: 26 }
const ESCURRE: Caja = { x: V.x0, y: 100, w: 154, h: 18 }
const HUMEDO: Caja = { x: HUM_X0, y: HUM_Y0, w: V.x1 - HUM_X0, h: 80 }
const RAIZ: Caja = { x: 172, y: 104, w: 136, h: 52 }
const GRIETA: Caja = { x: 13, y: 104, w: 142, h: 36 }
const FX_IZQ: Caja = { x: V.x0, y: 92, w: 150, h: 26 }
const FX_DER: Caja = { x: 170, y: 100, w: 136, h: 56 }
const HOJAS: Caja = { x: 150, y: 66, w: V.x1 - 150, h: 46 }
const AGUA: Caja = { x: PLUV.x - PLUV.r + 0.5, y: PLUV.y0 + 1, w: PLUV.r * 2 - 1, h: PLUV.y1 - PLUV.y0 - 1.5 }
const PENDIENTE = `${f((Math.atan(-0.02) * 180) / Math.PI)}deg` // la de ys()
/* Lluvia: un solo dibujo de rayas que el compositor corre hacia abajo en bucle (escena.css: un periodo de 96 de
   alto y 20 a la izquierda por el viento, en % de la caja). La ventana la recorta por la superficie del corte y la
   desvanece arriba, bajo las nubes. */
const LLUVIA_V: Caja = { x: V.x0, y: 44, w: V.x1 - V.x0, h: 72 }
const PERIODO = 96, VIENTO = 20
const LLUEVE: Caja = { x: LLUVIA_V.x, y: LLUVIA_V.y - PERIODO, w: LLUVIA_V.w + VIENTO, h: LLUVIA_V.h + PERIODO }
const LLUVIA = (() => {
  const r = azar(17), base = Array.from({ length: 22 }, (_, i) => ({ x: 12 + (i + r() * 0.8) * (LLUEVE.w + 6) / 22, y: LLUEVE.y + r() * PERIODO }))
  return [0, 1].flatMap((k) => base.map((g) => ({ x: g.x - k * VIENTO, y: g.y + k * PERIODO })))
})()
const RECORTE_LLUVIA = `polygon(0 0, 100% 0, ${rango(V.x0, V.x1, 2).reverse().map((x) => `${pct((x - LLUVIA_V.x) / LLUVIA_V.w)} ${pct((sup(x) - LLUVIA_V.y) / LLUVIA_V.h)}`).join(', ')})`
const MATAS = ([[190, 36, 1.5, false], [238, 40, -1.2, true], [287, 33, 2, false]] as const).map(([x, alto, inc, esp]) => {
  const base = ys(x) - 1
  return { x, base, alto, inc, esp, caja: { x: x - 19, y: f(base - alto - 8), w: 38, h: alto + 9 } }
})
const MUSTIAS = [[52, 0.6], [116, -0.5]].map(([x, inc]) => ({ x, inc, base: sup(x), caja: { x: x - 13, y: f(sup(x) - 27), w: 26, h: 28 } }))

/** Todo lo que no cambia con el mes, armado una sola vez por instancia (con ids propios de degradados y recortes). */
function useCapas(uid: string) {
  return useMemo(() => {
    const id = (n: string) => `${uid}-${n}`
    const url = (n: string) => `url(#${id(n)})`
    const recorte = (n: string, d: string) => <defs><clipPath id={id(n)}><path d={d} /></clipPath></defs>
    const etiqueta = (x: number, texto: ReactNode) => (
      <g>
        <text x={x} y={213.9} textAnchor="middle" className="esc-grabado-luz">{texto}</text>
        <text x={x} y={213.3} textAnchor="middle" className="esc-grabado">{texto}</text>
      </g>
    )

    const cielo = <>
      {/* ---------- cielo y lomas: lluvias debajo, verano encima, se funden */}
      <Capa caja={CIELO} className="esc-fija">
        <rect className="esc-cielo-lluvia" x={0} y={0} width={W} height={H} />
        <path className="esc-loma-lejos-lluvia" d={D_LOMA_LEJOS} />
        <path className="esc-loma-cerca-lluvia" d={D_LOMA_CERCA} />
      </Capa>
      <Capa caja={CIELO} className="esc-fija esc-fundido esc-solo-seco">
        <rect className="esc-cielo-seco" x={0} y={0} width={W} height={H} />
        <path className="esc-loma-lejos-seco" d={D_LOMA_LEJOS} />
        <path className="esc-loma-cerca-seco" d={D_LOMA_CERCA} />
      </Capa>
      <Cuadro caja={HALO} className="esc-fundido esc-solo-seco">
        <Capa caja={HALO} padre={HALO} className="esc-anim esc-halo">
          <defs><radialGradient id={id('halo')}>{parada(0, 'var(--seco)', 0.42)}{parada(0.45, 'var(--seco)', 0.16)}{parada(1, 'var(--seco)', 0)}</radialGradient></defs>
          <circle cx={112} cy={40} r={34} fill={url('halo')} />
        </Capa>
      </Cuadro>
      <Capa caja={SOL} className="esc-fija esc-fundido esc-solo-seco">
        <g transform="translate(112 40)">
          <g className="esc-rayos">{Array.from({ length: 16 }, (_, i) => <path key={i} d={i % 2 ? 'M0 -16v-2.2' : 'M0 -16v-4.2'} transform={`rotate(${i * 22.5})`} />)}</g>
          <circle className="esc-sol" r={12.5} />
          <circle className="esc-sol-luz" cx={-2} cy={-2} r={8.8} />
        </g>
      </Capa>
      {/* ---------- satélite: cruza de vez en cuando con un haz tenue hacia el terreno */}
      <Cuadro caja={CIELO} className="esc-recorta">
        <Capa caja={HAZ} padre={CIELO} className="esc-anim esc-orbita-haz">
          <defs><linearGradient id={id('haz')} x1="0" x2="0" y1="0" y2="1">{parada(0, 'var(--esc-haz)', 0.5)}{parada(1, 'var(--esc-haz)', 0.12)}</linearGradient></defs>
          <path d={`M234.6 21L219 ${f(yb(236) + 1)}L253 ${f(yb(236) + 1)}L237.4 21Z`} fill={url('haz')} />
        </Capa>
        <Capa caja={SAT} padre={CIELO} className="esc-anim esc-orbita-sat"><g transform="translate(236 15)"><Satelite /></g></Capa>
      </Cuadro>
      {/* ---------- nubes de lluvia */}
      <Cuadro caja={NUBES} className="esc-fundido esc-solo-lluvia esc-nubes">
        <Capa caja={NUBES} padre={NUBES} className="esc-anim esc-deriva"><Nube n={NUBE_CHICA} clip={id('nube-a')} /><Nube n={NUBE_GRANDE} clip={id('nube-b')} /></Capa>
      </Cuadro>
    </>

    const terreno = <>
      {/* ---------- el terreno detrás del corte: la base, lo de cada estación, y encima hojarasca y bruma */}
      <Capa caja={BANDA_C} className="esc-fija">
        <defs><linearGradient id={id('banda-g')} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">{parada(0.46, 'var(--esc-banda-pelado)')}{parada(0.54, 'var(--esc-banda-tapado)')}</linearGradient></defs>
        <path d={D_BANDA} fill={url('banda-g')} />
      </Capa>
      <Capa caja={BANDA_C} className="esc-fija esc-fundido esc-solo-seco">
        {recorte('banda-s', D_BANDA)}
        {/* verano: el suelo pelado se cuartea */}
        <g clipPath={url('banda-s')}>
          <path d={D_BANDA} className="esc-banda-polvo" />
          <g className="esc-grieta">
            {BANDA_GRIETAS.map((d, i) => <path key={i} d={d} />)}
            {BANDA_CRUCES.map((d, i) => <path key={'c' + i} d={d} />)}
          </g>
          <path className="esc-zanja" d={D_ZANJA_FONDO} />
        </g>
      </Capa>
      <Capa caja={BANDA_C} className="esc-fija esc-fundido esc-solo-lluvia">
        {recorte('banda-l', D_BANDA)}
        {/* lluvias: charcos y el agua corriendo hacia la izquierda, a la zanja */}
        <g clipPath={url('banda-l')}>
          <path d={D_BANDA} className="esc-banda-mojada" />
          <path className="esc-zanja" d={D_ZANJA_FONDO} />
          <path className="esc-zanja-agua" d={D_ZANJA_FONDO} />
          {HILOS.map((d, i) => <path key={'h' + i} className="esc-hilo" d={d} />)}
          {CHARCOS.map((c, i) => (
            <g key={i}>
              <ellipse className="esc-charco" cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} />
              <path className="esc-charco-brillo" d={`M${f(c.cx - c.rx * 0.55)} ${f(c.cy - 0.2)}h${f(c.rx * 0.6)}`} />
            </g>
          ))}
        </g>
      </Capa>
      <Capa caja={MEDIO_C} className="esc-fija">
        <defs>
          <clipPath id={id('banda')}><path d={D_BANDA} /></clipPath>
          <clipPath id={id('corte')}><path d={D_CORTE} /></clipPath>
          <linearGradient id={id('bruma')} x1="0" x2="0" y1="0" y2="1">{parada(0, 'var(--fondo)', 0.45)}{parada(1, 'var(--fondo)', 0)}</linearGradient>
          <linearGradient id={id('capa-a')} gradientUnits="userSpaceOnUse" x1="0" x2={W} y1="0" y2="0">{parada(0.44, 'var(--esc-a-pelado)')}{parada(0.56, 'var(--esc-a-tapado)')}</linearGradient>
          <linearGradient id={id('hondo')} x1="0" x2="0" y1="0" y2="1">{parada(0.3, 'var(--esc-sombra)', 0)}{parada(1, 'var(--esc-sombra)', 0.3)}</linearGradient>
          <linearGradient id={id('palidez')} gradientUnits="userSpaceOnUse" x1="0" x2="170" y1="0" y2="0">{parada(0, 'var(--esc-polvo)', 0.42)}{parada(0.84, 'var(--esc-polvo)', 0.42)}{parada(1, 'var(--esc-polvo)', 0)}</linearGradient>
          <linearGradient id={id('desvanece')} x1="0" x2="1" y1="0" y2="0">{parada(0, 'var(--esc-lamina)', 0)}{parada(0.25, 'var(--esc-lamina)', 1)}{parada(0.75, 'var(--esc-lamina)', 1)}{parada(1, 'var(--esc-lamina)', 0)}</linearGradient>
        </defs>
        <g clipPath={url('banda')}>
          {HOJARASCA_FONDO.map((h, i) => <ellipse key={i} className={`esc-hojarasca-${h.tono}`} cx={h.x} cy={h.y} rx={h.rx} ry={h.ry} transform={`rotate(${f(h.a)} ${f(h.x)} ${f(h.y)})`} />)}
          <path d={D_BANDA} fill={url('bruma')} />
        </g>
        {/* matas de atrás, chicas y pálidas por la distancia; ponytail: quietas a media altura, crecer no se nota a este tamaño */}
        <g className="esc-lejos">
          {[[176, 5.5], [214, 6.5], [257, 5.2], [298, 6.2]].map(([x, h]) => (
            <g key={x} transform={`translate(${x} ${f(ys(x) - h)}) scale(0.35) translate(${-x} ${f(-(ys(x) - h))})`}><Mata x={x} y={ys(x) - h} alto={36} inclina={1} hojas={MATA_GRANDE} espejo={x % 2 === 0} /></g>
          ))}
        </g>
        <g className="esc-lejos esc-mustia">
          {[[30, 6], [84, 5], [133, 6.5]].map(([x, h]) => (
            <g key={x} transform={`translate(${x} ${f(sup(x) - h)}) scale(0.35) translate(${-x} ${f(-(sup(x) - h))})`}><Mata x={x} y={sup(x) - h} alto={17} inclina={0.6} hojas={MATA_MUSTIA} /></g>
          ))}
        </g>
        {/* ---------- el corte */}
        <path className="esc-subsuelo" d={D_CORTE} />
        <g clipPath={url('corte')}>
          {MANCHAS.map((m, i) => <path key={i} className={m.tono} d={m.d} />)}
          {CONCRECIONES.map((c, i) => <circle key={i} className="esc-concrecion" cx={c.x} cy={c.y} r={c.r} />)}
          {PIEDRAS.map(([x, y, rx, ry], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${(i * 23) % 40 - 20})`}>
              <ellipse className="esc-piedra" rx={rx} ry={ry} />
              <path className="esc-piedra-sombra" d={`M${f(rx)} 0A${f(rx)} ${f(ry)} 0 0 1 ${f(-rx * 0.55)} ${f(ry * 0.83)}Q${f(rx * 0.35)} ${f(ry * 0.45)} ${f(rx)} 0Z`} />
              <path className="esc-piedra-luz" d={`M${f(-rx * 0.8)} ${f(-ry * 0.2)}Q${f(-rx * 0.55)} ${f(-ry * 0.85)} ${f(rx * 0.1)} ${f(-ry * 0.82)}Q${f(-rx * 0.45)} ${f(-ry * 0.45)} ${f(-rx * 0.8)} ${f(-ry * 0.2)}Z`} />
            </g>
          ))}
          <rect x="0" y={110} width={W} height={92} fill={url('hondo')} />
          <path d={D_CAPA_A} fill={url('capa-a')} />
          <path className="esc-limite" d={D_LIMITE_AB} />
          {/* pelado: un poco pálido siempre; el resto de la palidez del verano es otra capa */}
          <path d={D_CAPA_A} fill={url('palidez')} opacity={0.35} />
          {LAMINAS.map((d, i) => <path key={i} className="esc-lamina" d={d} stroke={url('desvanece')} />)}
          {/* tapado: grumos, poros y una lombriz en su galería */}
          {GRUMOS.map((d, i) => <path key={i} className="esc-grumo" d={d} />)}
          {POROS.map((p, i) => <circle key={i} className="esc-poro" cx={p.x} cy={p.y} r={p.r} />)}
          <path className="esc-galeria" d={LOMBRIZ_GALERIA} />
          <path className="esc-lombriz" d={linea(LOMBRIZ_CUERPO)} />
          <path className="esc-lombriz-luz" d={linea(LOMBRIZ_CUERPO.slice(1, -1))} />
          {LOMBRIZ_ANILLOS.map((d, i) => <path key={i} className={i === 5 || i === 6 ? 'esc-lombriz-collar' : 'esc-lombriz-anillo'} d={d} />)}
          <g className="esc-raiz esc-raiz-corta">{RAICES_PELADO.map((d, i) => <path key={i} d={d} />)}</g>
          {/* la estaca del pluviómetro sigue bajo tierra */}
          <path className="esc-madera" d={`M${MEDIO - 1.8} ${f(ys(MEDIO) - 1)}V${f(ys(MEDIO) + 24)}L${MEDIO} ${f(ys(MEDIO) + 28)}L${MEDIO + 1.8} ${f(ys(MEDIO) + 24)}V${f(ys(MEDIO) - 1)}Z`} />
          <path className="esc-madera-luz" d={`M${MEDIO - 1.8} ${f(ys(MEDIO) - 1)}V${f(ys(MEDIO) + 24)}L${MEDIO - 0.9} ${f(ys(MEDIO) + 25.8)}V${f(ys(MEDIO) - 1)}Z`} />
        </g>
        {/* ---------- la superficie en el corte */}
        <path className="esc-canto-pelado" d={D_CANTO_PELADO} />
        <path className="esc-canto-tapado" d={linea(rango(MEDIO - 2, 322, 2).map((x): P => [x, ys(x) - 0.2]))} />
      </Capa>
      {/* huella del satélite sobre el terreno: se mueve con él */}
      <Cuadro caja={CIELO} className="esc-recorta">
        <Capa caja={HUELLA} padre={CIELO} className="esc-anim esc-orbita-huella"><ellipse className="esc-huella" cx={236} cy={f(yb(236) + 3.6)} rx={17} ry={2.4} /></Capa>
      </Cuadro>
      {/* verano: el lado pelado suelta su humedad al aire */}
      <Cuadro caja={VAHO} className="esc-fundido esc-solo-seco">
        {VAPOR.map((v, i) => (
          <Capa key={i} caja={{ x: v.x - 2.5, y: f(v.y - 15), w: 5, h: 16 }} padre={VAHO} className="esc-anim esc-vaho" style={parar(v)}>
            <defs><linearGradient id={id('vapor' + i)} x1="0" x2="0" y1="0" y2="1">{parada(0, 'var(--esc-vapor)', 0)}{parada(0.45, 'var(--esc-vapor)', 1)}{parada(1, 'var(--esc-vapor)', 0)}</linearGradient></defs>
            <path className="esc-vapor" d={`M${v.x} ${f(v.y)}c-1.6 -2.6 1.6 -4.4 0 -7s1.6 -4.4 0 -7`} stroke={url('vapor' + i)} />
          </Capa>
        ))}
      </Cuadro>
      {/* verano: más pálido por dentro (las láminas y raíces cortas se vuelven a dibujar encima) */}
      <Capa caja={PALIDEZ} className="esc-fija esc-fundido esc-solo-seco">
        <defs>
          <linearGradient id={id('palidez-v')} gradientUnits="userSpaceOnUse" x1="0" x2="170" y1="0" y2="0">{parada(0, 'var(--esc-polvo)', 0.42)}{parada(0.84, 'var(--esc-polvo)', 0.42)}{parada(1, 'var(--esc-polvo)', 0)}</linearGradient>
          <linearGradient id={id('desvanece-v')} x1="0" x2="1" y1="0" y2="0">{parada(0, 'var(--esc-lamina)', 0)}{parada(0.25, 'var(--esc-lamina)', 1)}{parada(0.75, 'var(--esc-lamina)', 1)}{parada(1, 'var(--esc-lamina)', 0)}</linearGradient>
        </defs>
        <path d={D_CAPA_A} fill={url('palidez-v')} opacity={0.76} />
        {LAMINAS.map((d, i) => <path key={i} className="esc-lamina" d={d} stroke={url('desvanece-v')} />)}
        <g className="esc-raiz esc-raiz-corta">{RAICES_PELADO.map((d, i) => <path key={i} d={d} />)}</g>
      </Capa>
      {/* lluvias: la piel mojada apenas entra, y las gotas se frenan en la costra */}
      <Capa caja={PIEL} className="esc-bucle esc-fundido esc-solo-lluvia">
        {recorte('corte-p', D_CORTE)}
        <defs><linearGradient id={id('piel')} x1="0" x2="0" y1="0" y2="1">{parada(0, 'var(--esc-piel)', 0.75)}{parada(1, 'var(--esc-piel)', 0)}</linearGradient></defs>
        <g clipPath={url('corte-p')}>
          <path d={D_PIEL} fill={url('piel')} />
          {FRENA.map((g, i) => <g key={i} transform={`translate(${g.x} ${f(g.y)})`}><g className="esc-anim esc-frena" style={parar(g)}><path className="esc-gota" d={GOTA} transform="scale(0.8)" /></g></g>)}
        </g>
      </Capa>
      {/* lluvias: lámina de agua turbia que corre hacia el borde llevándose la tierra */}
      <Capa caja={ESCURRE} className="esc-fija esc-fundido esc-solo-lluvia">
        <defs><linearGradient id={id('escurre')} gradientUnits="userSpaceOnUse" x1="0" x2="152" y1="0" y2="0">{parada(0, 'var(--esc-lodo)')}{parada(0.55, 'var(--esc-lodo-claro)')}{parada(1, 'var(--esc-agua-clara)')}</linearGradient></defs>
        <path className="esc-canto-pelado" d={D_CANTO_PELADO} />
        <path d={D_ESCURRE} fill={url('escurre')} />
        <path className="esc-escurre-brillo" d={D_ESCURRE_BRILLO} />
      </Capa>
    </>

    const grietas = <>
      {recorte('corte-g', D_CORTE)}
      <g clipPath={url('corte-g')}>
        {GRIETAS.map((g, i) => (
          <g key={i}>
            <path className="esc-grieta-fondo" d={g.cuña} />
            {g.ramas.map((d, k) => <path key={k} className="esc-grieta-fondo" d={d} />)}
            <path className="esc-labio" d={g.labio} />
          </g>
        ))}
      </g>
    </>
    const humedo = <>
      <defs><linearGradient id={id('humedo')} x1="0" x2="0" y1="0" y2="1">
        {parada(0, 'var(--esc-humedo)', 0.66)}{parada(0.55, 'var(--esc-humedo)', 0.5)}{parada(0.84, 'var(--esc-humedo)', 0.4)}{parada(0.97, 'var(--esc-humedo)', 0.08)}{parada(1, 'var(--esc-humedo)', 0)}
      </linearGradient></defs>
      <path d={D_HUMEDO} fill={url('humedo')} />
    </>
    const raices = <g className="esc-raiz">{RAICES_TAPADO.map((d, i) => <path key={i} d={d} />)}</g>

    const efectos = <>
      {/* lluvias: salpica, corre y arrastra tierra sobre lo pelado; del lado tapado las gotas bajan por el perfil */}
      <Capa caja={FX_IZQ} className="esc-bucle esc-fundido esc-solo-lluvia">
        {CORRIENTE.map((c, i) => <path key={i} className="esc-anim esc-corre" style={parar(c)} d={`M${c.x + 4} ${f(agua(c.x + 4) + 0.9)}h-5`} />)}
        {ARRASTRE.map((a, i) => <circle key={'a' + i} className="esc-anim esc-arrastra" style={parar(a)} cx={a.x + 6} cy={f((agua(a.x + 6) + sup(a.x + 6)) / 2 + 0.3)} r={a.r} />)}
        {SALPICA.map((s, i) => (
          <g key={'s' + i} transform={`translate(${s.x} ${f(s.y)})`}>
            <ellipse className="esc-anim esc-anillo" style={parar(s)} rx={2.6} ry={0.6} />
            {GOTITAS.map((g, k) => (
              <circle key={k} className="esc-anim esc-salpica" r={g.r} cx={f(g.dx * 0.55)} cy={f(g.dy)}
                style={{ animationDelay: `${s.d}s`, '--dx': `${f(g.dx * 0.45)}px`, '--dy': `${f(-g.dy)}px` } as CSSProperties} />
            ))}
          </g>
        ))}
      </Capa>
      <Capa caja={FX_DER} className="esc-bucle esc-fundido esc-solo-lluvia">
        {recorte('corte-e', D_CORTE)}
        <g clipPath={url('corte-e')}>
          {ENTRA.map((g, i) => <g key={i} transform={`translate(${g.x} ${f(g.y)})`}><path className="esc-anim esc-entra esc-gota" style={parar(g)} d={GOTA} /></g>)}
        </g>
      </Capa>
      {/* hojarasca en corte, en tres filas; las matas salen entre la segunda y la tercera */}
      <Capa caja={HOJAS} className="esc-fija">
        {HOJARASCA.filter((h) => h.y > ys(h.x) - 5).map(hojaSeca)}
        <PluviometroFondo />
      </Capa>
    </>
    const matas = MATAS.map((m) => <Mata key={m.x} x={m.x} y={m.base} alto={m.alto} inclina={m.inc} hojas={MATA_GRANDE} espejo={m.esp} />)
    const mustias = MUSTIAS.map((m) => <Mata key={m.x} x={m.x} y={m.base} alto={18} inclina={m.inc} hojas={MATA_MUSTIA} espejo={m.x > 100} />)

    const frente = <>
      <Capa caja={HOJAS} className="esc-fija">
        {HOJARASCA.filter((h) => h.y <= ys(h.x) - 5).map(hojaSeca)}
        <PluviometroFrente />
      </Capa>
      {/* ---------- la lluvia, por delante de todo lo que está sobre el suelo */}
      <Cuadro caja={LLUVIA_V} className="esc-fundido esc-solo-lluvia esc-lluvia" style={{ clipPath: RECORTE_LLUVIA }}>
        <Capa caja={LLUEVE} padre={LLUVIA_V} className="esc-anim esc-llueve">
          <g className="esc-cae">{LLUVIA.map((g, i) => <path key={i} d={`M${f(g.x)} ${f(g.y)}l-1.3 6.2`} />)}</g>
        </Capa>
      </Cuadro>
      <Capa caja={TODO} className="esc-fija">
        <defs><linearGradient id={id('sombra-marco')} x1="0" x2="0" y1="0" y2="1">{parada(0, 'var(--esc-sombra)', 0.22)}{parada(1, 'var(--esc-sombra)', 0)}</linearGradient></defs>
        <rect x={V.x0} y={V.y0} width={V.x1 - V.x0} height={10} fill={url('sombra-marco')} />
        {/* ---------- el marco: una caja de muestra con su placa grabada */}
        <path className="esc-marco" fillRule="evenodd" d={`M12 0H${W - 12}A12 12 0 0 1 ${W} 12V${H - 12}A12 12 0 0 1 ${W - 12} ${H}H12A12 12 0 0 1 0 ${H - 12}V12A12 12 0 0 1 12 0Z
          M${V.x0 + V.r} ${V.y0}H${V.x1 - V.r}A${V.r} ${V.r} 0 0 1 ${V.x1} ${V.y0 + V.r}V${V.y1 - V.r}A${V.r} ${V.r} 0 0 1 ${V.x1 - V.r} ${V.y1}H${V.x0 + V.r}A${V.r} ${V.r} 0 0 1 ${V.x0} ${V.y1 - V.r}V${V.y0 + V.r}A${V.r} ${V.r} 0 0 1 ${V.x0 + V.r} ${V.y0}Z`} />
        <path className="esc-marco-luz" d={`M0.6 12A11.4 11.4 0 0 1 12 0.6H${W - 12}A11.4 11.4 0 0 1 ${W - 0.6} 12`} />
        {/* canto interior: sombra arriba e izquierda, luz abajo y derecha; se encuentran en las esquinas */}
        <path className="esc-bisel-sombra" d={`M${V.x0 + 0.5} ${V.y1 - V.r}V${V.y0 + V.r}A${V.r - 0.5} ${V.r - 0.5} 0 0 1 ${V.x0 + V.r} ${V.y0 + 0.5}H${V.x1 - V.r}`} />
        <path className="esc-bisel-luz" d={`M${V.x1 - V.r} ${V.y0 + 0.5}A${V.r - 0.5} ${V.r - 0.5} 0 0 1 ${V.x1 - 0.5} ${V.y0 + V.r}V${V.y1 - V.r}A${V.r - 0.5} ${V.r - 0.5} 0 0 1 ${V.x1 - V.r} ${V.y1 - 0.5}H${V.x0 + V.r}A${V.r - 0.5} ${V.r - 0.5} 0 0 1 ${V.x0 + 0.5} ${V.y1 - V.r}`} />
        {/* la mitad, marcada en los dos travesaños */}
        <path className="esc-muesca" d={`M${MEDIO} ${V.y1 + 0.6}v3.4M${MEDIO} ${V.y0 - 0.6}v-3`} />
        {[13, W - 13].map((x) => (
          <g key={x}>
            <circle className="esc-tornillo-marco" cx={x} cy={210.5} r={2} />
            <path className="esc-ranura" d={`M${x - 1.4} ${210.5 + 0.5}L${x + 1.4} ${210.5 - 0.5}`} />
          </g>
        ))}
        {etiqueta((V.x0 + MEDIO) / 2 + 2, L('Suelo pelado', 'Bare soil'))}
        {etiqueta((MEDIO + V.x1) / 2 - 2, L('Tapado con hojas', 'Covered with dry leaves'))}
      </Capa>
    </>
    return { cielo, terreno, grietas, humedo, raices, efectos, matas, mustias, frente }
  }, [uid])
}

/* ------------------------------------------------------------------ escena */

export function Escena({ mes }: { mes: number }) {
  const seco = esSeco(mes)
  const quieto = useReducedMotion()
  const c = useCapas('e' + useId().replace(/[^a-zA-Z0-9_-]/g, ''))
  // en lluvias las matas del lado tapado crecen mes a mes; en verano se quedan medianas bajo su capa de hojas
  const avance = seco ? 0 : Math.min(1, (mes - 4) / 6)
  const crece = seco ? 0.64 : 0.74 + 0.26 * avance
  const creceMustia = seco ? 0.62 : 0.72 + 0.08 * avance
  const escala = (s: number) => ({ transform: `translateZ(0) scale(${f(s)})` })

  return (
    <figure className="escena-fig esc-fig" data-estacion={seco ? 'seco' : 'lluvia'}>
      <div className="esc-lienzo" role="img" aria-label={L(
        'Corte de un mismo terreno a lo largo del año, partido en dos. A la izquierda, suelo pelado: en verano se agrieta y se seca por dentro; con el aguacero salpica, el agua corre por encima llevándose la tierra y casi nada entra. A la derecha, el suelo tapado con hojas secas: el agua entra y moja el suelo hasta las raíces, en verano la humedad se guarda bajo las hojas y en lluvias las matas crecen. Un pluviómetro en medio marca la misma lluvia para las dos mitades y un satélite de la NASA pasa mirando.',
        'Cross-section of one piece of land through the year, split in two. On the left, bare soil: in the dry season it cracks and dries inside; in heavy rain it splashes, the water runs off the top carrying soil away and almost none soaks in. On the right, the soil covered with dry leaves: the water soaks in down to the roots, in the dry season the moisture stays under the leaves, and in the rainy season the plants grow. A rain gauge in the middle shows the same rain on both halves, and a NASA satellite passes overhead, watching.')}>
        {c.cielo}
        {c.terreno}
        {/* el agua guardada / el agua que entra: el frente de humedad baja en lluvias */}
        <Capa caja={HUMEDO} className="esc-crece esc-humedo" style={{ transformOrigin: '0 0', ['--esc-pendiente' as string]: PENDIENTE }}>{c.humedo}</Capa>
        <Capa caja={RAIZ} className="esc-crece" style={{ transformOrigin: origen(RAIZ, 238, ys(287) + 0.5), ...escala(0.78 + (0.22 * (crece - 0.64)) / 0.36) }}>{c.raices}</Capa>
        {/* verano: grietas que bajan y se abren */}
        <Capa caja={GRIETA} className="esc-crece esc-grietas" style={{ transformOrigin: origen(GRIETA, 84, 105.5) }}>{c.grietas}</Capa>
        {c.efectos}
        {MATAS.map((m, i) => <Capa key={m.x} caja={m.caja} className="esc-crece" style={{ transformOrigin: origen(m.caja, m.x, m.base), ...escala(crece) }}>{c.matas[i]}</Capa>)}
        <div className="esc-mustia">
          {MUSTIAS.map((m, i) => <Capa key={m.x} caja={m.caja} className="esc-crece" style={{ transformOrigin: origen(m.caja, m.x, m.base), ...escala(creceMustia) }}>{c.mustias[i]}</Capa>)}
        </div>
        <Capa caja={AGUA} className="esc-crece" style={{ transformOrigin: '50% 100%', transform: `translateZ(0) scaleY(${f(Math.max(0.03, LLUVIA_REL[mes]))})` }}>
          <rect className="esc-agua-tubo" x={AGUA.x} y={AGUA.y} width={AGUA.w} height={AGUA.h} />
        </Capa>
        {c.frente}
      </div>
      <figcaption>
        <span className="esc-mes">
          <AnimatePresence initial={false}>
            <motion.span key={mes} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={quieto ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.3 }}>
              {NOMBRE_MES[mes]}
            </motion.span>
          </AnimatePresence>
        </span>
        <b>{seco ? L('verano', 'dry season') : L('lluvias', 'rainy season')}</b>
        <span className="esc-anio" aria-hidden="true">
          {NOMBRE_MES.map((_, i) => <i key={i} data-seco={esSeco(i)} data-actual={i === mes} />)}
        </span>
      </figcaption>
    </figure>
  )
}
