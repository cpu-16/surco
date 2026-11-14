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
  reciente_imerg?: { hasta: string; dias: { fecha: string; lluvia: number }[]; racha_seca_dias: number; ultima_racha: { desde: string; hasta: string; dias: number } | null; lluvia_30d: number }
  lluvia_mensual: Record<string, number>
  ndvi?: { meses: { mes: number; ndvi: number | null; n: number }[]; ultimo: { fecha: string; valor: number } | null; n_validos: number; n_total: number; serie?: { fecha: string; valor: number | null }[]; progreso?: [number, number] }
  et?: { fecha: string; valor: number | null }[]
  pet?: { fecha: string; valor: number | null }[]
  lst?: { fecha: string; valor: number | null }[]
  pendiente: string[]
}

export type Foto = { id: string; tipo: TipoFoto; fecha: string; cobertura: number; descripcion?: string; hojarasca?: 'mucha' | 'poca' | 'nada' | null; miniatura: string; mascara?: string }
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
  infiltracion_min: number | null // minutos que tarda en entrar la segunda lata (450 mL, 2,5 cm de agua)
  charcos?: 'si' | 'no' | 'nose' | null // ¿quedan charcos al día siguiente de un aguacero?
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

/** El expediente sin imágenes: lo que se manda al servidor. Las fotos se quedan en el celular. */
export const sinImagenes = (e: Expediente) => ({ ...e, fotos: e.fotos.map(({ miniatura: _m, mascara: _k, ...f }) => ({ ...f, miniatura: '' })) })

/** Guardado local que nunca rompe la app (modo privado, almacenamiento lleno). */
export const local = {
  leer<T>(k: string): T | null { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) as T : null } catch { return null } },
  poner(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* lleno o bloqueado */ } },
  quitar(k: string) { try { localStorage.removeItem(k) } catch { /* bloqueado */ } },
}
