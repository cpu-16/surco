export type Normal = { mes: number; nombre: string; lluvia: number; et0: number; tmax: number; humedad_raiz: number }
export type Ninos = {
  eventos: { evento: string; meses: { mes: number; lluvia: number; pct_normal: number | null }[] }[]
  promedio: { mes: number; pct_normal: number | null }[]
}
export type Fuente = { producto: string; celda: string; url: string | string[]; consultado: string; unidades: unknown }
export type Lugar = {
  punto: { lat: number; lon: number; elevacion_m: number }
  fuentes: Record<string, Fuente>
  normales: Normal[]
  ninos: Ninos
  reciente_power: { hasta: string; dias: { fecha: string; lluvia: number }[]; lluvia_30d: number; normal_30d: number | null }
  reciente_imerg?: { hasta: string; dias: { fecha: string; lluvia: number }[]; racha_seca_dias: number; lluvia_30d: number }
  lluvia_mensual: Record<string, number>
  ndvi?: { meses: { mes: number; ndvi: number | null; n: number }[]; ultimo: { fecha: string; valor: number } | null; n_validos: number; n_total: number; serie: { fecha: string; valor: number | null }[] }
  et?: { fecha: string; valor: number | null }[]
  pet?: { fecha: string; valor: number | null }[]
  lst?: { fecha: string; valor: number | null }[]
  pendiente: string[]
}

export type Foto = { id: string; tipo: TipoFoto; fecha: string; cobertura: number; descripcion?: string; hojarasca?: 'mucha' | 'poca' | 'nada' | null; miniatura: string }
export type TipoFoto = 'cama' | 'perennes' | 'pina' | 'general'
export type Expediente = {
  id?: string
  nombre: string
  lat: number
  lon: number
  cultivos: string[]
  prioridades: string[]
  riego: 'no' | 'a veces' | 'si' | ''
  siembras: Record<string, string> // cultivo -> 'AAAA-MM'
  fotos: Foto[]
  infiltracion_min: number | null // minutos que tarda 1 litro en un hoyo de 20 cm
  notas: { quien: 'productor' | 'tecnico'; texto: string; fecha: string }[]
}

export const EJEMPLO: Expediente = {
  nombre: 'Patio en Santiago de Veraguas',
  lat: 8.1,
  lon: -80.98,
  cultivos: ['yuca', 'pina', 'platano', 'cacao', 'naranja', 'toronja'],
  prioridades: [],
  riego: '',
  siembras: {},
  fotos: [],
  infiltracion_min: null,
  notas: [],
}

export async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ruta, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `El servidor respondió ${r.status}`)
  return r.json()
}
