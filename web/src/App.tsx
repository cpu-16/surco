import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { EJEMPLO, pedir, type Expediente, type Foto, type Lugar, type TipoFoto } from './api'
import { medir } from './canopeo'
import { BarrasLluvia, MESES, MESES_LARGOS, NdviMeses, ordenMeses, Reciente } from './graficos'

const Mapa = lazy(() => import('./mapa'))
const Pregunta = lazy(() => import('./pregunta'))

export type Muestra = { mes: number; cultivo: string | null; nombre: string | null; cobertura: 'alta' | 'media' | 'baja' | 'desnudo'; medido?: boolean }
export type Estrategia = {
  id: string; nombre: string; aplica_a: string; tira: Muestra[]; arboles: Muestra[]; meses_desnudo: number; desnudo_cama: number; desnudo_arboles: number
  n_kg_ha: [number, number] | null
  agua: { demanda_seca_mm: number; deficit_normal_mm: number; deficit_nino_mm: number }
  razon: string; evidencia: { id: string; titulo: string; url: string }[]
  beneficios: string[]; vacios: string[]; riesgos: string[]; ajustes: string[]
}
export type Comparacion = { estrategias: Estrategia[]; faltan: { clave: string; texto: string; cambia: string }[]; lectura: string[] }

const CULTIVOS: [string, string][] = [
  ['yuca', 'Yuca'], ['pina', 'Piña'], ['platano', 'Plátano'], ['cacao', 'Cacao'], ['naranja', 'Naranja'], ['toronja', 'Toronja'],
  ['maiz', 'Maíz'], ['frijol', 'Frijol'], ['guandu', 'Guandú'], ['otoe', 'Otoe'], ['name', 'Ñame'], ['zapallo', 'Zapallo'],
]
const PRIORIDADES: [string, string][] = [
  ['agua', 'Gastar menos agua'], ['suelo', 'Mejorar el suelo'], ['comida', 'Comida para la casa'], ['venta', 'Algo para vender'], ['trabajo', 'Menos trabajo'],
]
const FOTOS: { tipo: TipoFoto; titulo: string; como: string }[] = [
  { tipo: 'cama', titulo: 'Suelo de la cama de yuca y piña', como: 'De pie, el celular a la altura del pecho, mirando hacia abajo.' },
  { tipo: 'perennes', titulo: 'Suelo debajo del cacao o los cítricos', como: 'Igual, pero bajo la copa del árbol. El satélite no ve esto.' },
  { tipo: 'pina', titulo: 'Una piña completa', como: 'La planta entera con su base.' },
  { tipo: 'general', titulo: 'El patio entero', como: 'Desde una esquina, para ver si hay pendiente.' },
]
const COLOR = { alta: 'var(--hoja)', media: 'var(--brote)', baja: 'var(--rastrojo)', desnudo: 'var(--laterita)' }
const LLAVE = 'surco-expediente'

function cargarLocal(): Expediente {
  try {
    const s = localStorage.getItem(LLAVE)
    if (s) return { ...EJEMPLO, ...JSON.parse(s) }
  } catch { /* sin almacenamiento: se usa el ejemplo */ }
  return EJEMPLO
}

export default function App() {
  const [exp, setExp] = useState<Expediente>(cargarLocal)
  const [lugar, setLugar] = useState<Lugar | null>(null)
  const [comp, setComp] = useState<Comparacion | null>(null)
  const [error, setError] = useState('')
  const mesActual = new Date().getMonth() + 1

  useEffect(() => {
    try { localStorage.setItem(LLAVE, JSON.stringify(exp)) } catch { /* lleno o bloqueado */ }
  }, [exp])

  // el satélite: se vuelve a pedir mientras falten series que ORNL todavía está bajando
  useEffect(() => {
    let vivo = true, t = 0
    const traer = () => pedir<Lugar>(`/api/lugar?lat=${exp.lat}&lon=${exp.lon}`)
      .then((l) => { if (!vivo) return; setLugar(l); setError(''); if (l.pendiente.length) t = window.setTimeout(traer, 15000) })
      .catch((e) => vivo && setError(e.message))
    traer()
    return () => { vivo = false; clearTimeout(t) }
  }, [exp.lat, exp.lon])

  // la comparación se recalcula con cada dato de campo
  const claveComp = JSON.stringify({ ...exp, fotos: exp.fotos.map((f) => [f.tipo, f.cobertura, f.hojarasca]) })
  useEffect(() => {
    if (!lugar) return
    const datos = { ...exp, fotos: exp.fotos.map(({ miniatura: _m, ...f }) => f) }
    pedir<Comparacion>('/api/comparar', { method: 'POST', body: JSON.stringify({ expediente: datos }) })
      .then(setComp).catch(() => setComp(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveComp, lugar?.punto.lat, lugar?.punto.lon])

  const cambiar = (p: Partial<Expediente>) => setExp((e) => ({ ...e, ...p }))

  // lo que el productor contó en la conversación, ya confirmado por él
  useEffect(() => {
    const f = (ev: Event) => {
      const p = (ev as CustomEvent<Partial<Expediente>>).detail
      setExp((e) => ({ ...e, ...p, siembras: { ...e.siembras, ...(p.siembras ?? {}) } }))
    }
    window.addEventListener('surco-propuesta', f)
    return () => window.removeEventListener('surco-propuesta', f)
  }, [])

  useEffect(() => {
    const f = (ev: Event) => {
      const { tipo, extra } = (ev as CustomEvent<{ tipo: TipoFoto; extra: Partial<Foto> }>).detail
      setExp((e) => ({ ...e, fotos: e.fotos.map((x) => x.tipo === tipo ? { ...x, ...extra, hojarasca: x.hojarasca ?? extra.hojarasca } : x) }))
    }
    window.addEventListener('surco-foto', f)
    return () => window.removeEventListener('surco-foto', f)
  }, [])

  // enlace compartido: el técnico abre el mismo expediente
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('e')
    if (id && id !== exp.id) pedir<{ datos: Expediente }>(`/api/expediente/${encodeURIComponent(id)}`).then((r) => setExp({ ...EJEMPLO, ...r.datos, id })).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="app">
      <header>
        <p className="nota">Expediente del suelo</p>
        <h1>{exp.nombre}</h1>
        <p className="nota">
          {exp.cultivos.length} cultivos, {exp.fotos.length} {exp.fotos.length === 1 ? 'foto' : 'fotos'}
          {lugar && <>, a {Math.round(lugar.punto.elevacion_m)} m sobre el mar</>}
        </p>
      </header>

      {error && <p role="alert" className="estado falta">No se pudo leer el satélite: {error}</p>}

      <Faltan comp={comp} />
      <Comparar comp={comp} desde={mesActual} />
      <LoQueVes exp={exp} cambiar={cambiar} />
      {lugar ? <Satelite lugar={lugar} desde={mesActual} exp={exp} /> : <p className="nota">Leyendo 45 años de clima de la NASA para tu punto…</p>}
      <TuParcela exp={exp} cambiar={cambiar} />
      <Suspense fallback={null}>
        <Pregunta exp={exp} lugar={lugar} comp={comp} />
      </Suspense>
      <Compartir exp={exp} cambiar={cambiar} />
    </main>
  )
}

function Faltan({ comp }: { comp: Comparacion | null }) {
  if (!comp?.faltan.length) return null
  return (
    <section aria-labelledby="t-falta" style={{ marginTop: '1.2rem' }}>
      <h3 id="t-falta">Para decidir falta</h3>
      <ul className="falta-lista">
        {comp.faltan.map((f) => (
          <li key={f.clave}>
            <strong>{f.texto}</strong>
            <a href={`#${f.clave}`}>Hacerlo</a>
            <span className="nota" style={{ gridColumn: '1 / -1' }}>{f.cambia}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Comparar({ comp, desde }: { comp: Comparacion | null; desde: number }) {
  const [mesSel, setMesSel] = useState<number | null>(null)
  const orden = ordenMeses(desde)
  return (
    <section className="seccion" aria-labelledby="t-comp">
      <header><h2 id="t-comp">El año de tu suelo</h2><span className="estado">{comp ? `${comp.estrategias.length} maneras` : 'calculando'}</span></header>
      <p>Cada cuadro es un mes. Rojo es suelo desnudo, que el sol y el aguacero se llevan. Verde es suelo tapado.</p>
      {comp?.lectura.map((l, i) => <p key={i}><strong>{l}</strong></p>)}
      <Leyenda />
      {comp?.estrategias.map((e) => (
        <details key={e.id} className="estrategia">
          <summary>
            <h3>{e.nombre}</h3>
            <p className="nota">
              Suelo desnudo: {e.desnudo_cama} {e.desnudo_cama === 1 ? 'mes' : 'meses'} en la cama y {e.desnudo_arboles} debajo de los árboles
              {e.n_kg_ha && `. Las leguminosas pueden dejar ${e.n_kg_ha[0]} a ${e.n_kg_ha[1]} kg de nitrógeno por hectárea`}.
            </p>
            {[['Cama', e.tira], ['Árboles', e.arboles]].map(([etq, fila]) => (
              <div key={etq as string} className="fila-tira">
                <span className="etq">{etq as string}</span>
                <div className="tira" role="img" aria-label={`${e.nombre}, ${etq}: ${(fila as Muestra[]).map((m) => `${MESES_LARGOS[m.mes - 1]} ${m.nombre ?? 'desnudo'}`).join(', ')}`}>
                  {orden.map((mes) => {
                    const m = (fila as Muestra[]).find((x) => x.mes === mes)!
                    return (
                      <button key={mes} className="muestra" data-sel={mesSel === mes ? 1 : 0} data-medido={m.medido ? 1 : 0} style={{ background: COLOR[m.cobertura] }}
                        onClick={(ev) => { ev.preventDefault(); setMesSel(mesSel === mes ? null : mes) }}
                        aria-label={`${MESES_LARGOS[mes - 1]}: ${m.nombre ?? 'suelo desnudo'}`}>
                        {m.nombre?.slice(0, 3) ?? ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="fila-tira"><span className="etq" /><div className="meses" aria-hidden="true">{orden.map((m) => <span key={m}>{MESES[m - 1]}</span>)}</div></div>
            {mesSel && <p className="nota">En {MESES_LARGOS[mesSel - 1]}: la cama con {e.tira.find((x) => x.mes === mesSel)?.nombre?.toLowerCase() ?? 'suelo desnudo'}, debajo de los árboles {e.arboles.find((x) => x.mes === mesSel)?.nombre?.toLowerCase() ?? 'suelo desnudo'}.</p>}
            <p className="abrir">Ver por qué, qué le da al suelo y sus riesgos</p>
          </summary>
          <div className="campos">
            <div><h4>Por qué se sugiere</h4><p>{e.razon}</p></div>
            {!!e.ajustes.length && <div><h4>Lo que cambió con tus datos</h4><ul>{e.ajustes.map((a) => <li key={a}>{a}</li>)}</ul></div>}
            <div><h4>Qué le da al suelo</h4><ul>{e.beneficios.map((b) => <li key={b}>{b}</li>)}</ul></div>
            <div><h4>Lo que todavía no se sabe</h4><ul>{e.vacios.map((b) => <li key={b}>{b}</li>)}</ul></div>
            <div><h4>Para revisar con un técnico</h4><ul>{e.riesgos.map((b) => <li key={b}>{b}</li>)}</ul></div>
            <div><h4>De dónde sale</h4><ul>{e.evidencia.map((f) => <li key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></li>)}</ul></div>
          </div>
        </details>
      ))}
      <p className="nota">La herramienta muestra patrones y posibilidades. La decisión es tuya, y conviene revisarla con un técnico del MIDA o del IDIAP.</p>
    </section>
  )
}

const claseInfil = (m: number) =>
  ([[3, 'muy rápida'], [10, 'rápida'], [30, 'moderadamente rápida'], [100, 'moderada'], [300, 'moderadamente lenta'], [1000, 'lenta'], [40000, 'muy lenta']] as const)
    .find(([lim]) => m < lim)?.[1] ?? 'casi nula'

function Leyenda() {
  const items: [keyof typeof COLOR, string][] = [['desnudo', 'Desnudo'], ['baja', 'Poco tapado o acolchado'], ['media', 'Medio tapado'], ['alta', 'Bien tapado']]
  return (
    <div className="leyenda">
      {items.map(([k, t]) => <span key={k}><i style={{ background: COLOR[k] }} />{t}</span>)}
      <span><i className="medido" />Medido con tu foto</span>
    </div>
  )
}

function LoQueVes({ exp, cambiar }: { exp: Expediente; cambiar: (p: Partial<Expediente>) => void }) {
  const [midiendo, setMidiendo] = useState<TipoFoto | null>(null)
  const [mascara, setMascara] = useState<Record<string, string>>({})
  // ponytail: la respuesta de la IA llega después; se pega a la foto vigente de ese tipo, sin pisar otras
  const setFotoIA = (tipo: TipoFoto, extra: Partial<Foto>) => window.dispatchEvent(new CustomEvent('surco-foto', { detail: { tipo, extra } }))
  const tomar = async (tipo: TipoFoto, archivo?: File) => {
    if (!archivo) return
    setMidiendo(tipo)
    try {
      const r = await medir(archivo)
      const foto: Foto = { id: crypto.randomUUID(), tipo, fecha: new Date().toISOString().slice(0, 10), cobertura: r.cobertura, miniatura: r.miniatura }
      setMascara((m) => ({ ...m, [tipo]: r.mascara }))
      cambiar({ fotos: [...exp.fotos.filter((f) => f.tipo !== tipo), foto] })
      // la IA describe la foto; la cobertura ya está medida y no la toca
      const fd = new FormData(); fd.append('foto', r.jpeg, 'foto.jpg'); fd.append('tipo', tipo)
      fetch('/api/ia/foto', { method: 'POST', body: fd }).then((x) => x.ok ? x.json() : null).then((j) => {
        if (j?.descripcion) setFotoIA(tipo, { descripcion: j.descripcion, hojarasca: j.hojarasca })
      }).catch(() => { /* sin IA queda la medición */ })
    } finally { setMidiendo(null) }
  }
  const listos = FOTOS.filter((f) => exp.fotos.some((x) => x.tipo === f.tipo)).length + (exp.infiltracion_min != null ? 1 : 0)
  return (
    <section className="seccion" aria-labelledby="t-ves">
      <header><h2 id="t-ves">Lo que ves tú</h2><span className={`estado ${listos === 5 ? 'listo' : 'falta'}`}>{listos} de 5</span></header>
      <p>El satélite ve tu zona desde arriba. Tus fotos ven el suelo. La parte verde se mide en tu celular y la foto no se guarda en ningún lado.</p>
      {FOTOS.map((f) => {
        const foto = exp.fotos.find((x) => x.tipo === f.tipo)
        return (
          <div key={f.tipo} id={`foto_${f.tipo}`} style={{ margin: '1.2rem 0' }}>
            <h3>{f.titulo}</h3>
            <p className="nota">{f.como}</p>
            {foto && (
              <div className="dos" style={{ margin: '0.6rem 0' }}>
                <img src={foto.miniatura} alt={f.titulo} style={{ width: '100%', borderRadius: 8 }} />
                {mascara[f.tipo] ? <img src={mascara[f.tipo]} alt="Parte verde detectada" style={{ width: '100%', borderRadius: 8 }} /> : null}
              </div>
            )}
            {foto && <p><span className="cifra">{foto.cobertura}%</span> del suelo tapado por planta verde <span className="fuente">método Canopeo</span></p>}
            {foto?.descripcion && <p className="nota">Lo que se ve: {foto.descripcion}</p>}
            {foto && (f.tipo === 'perennes' || f.tipo === 'cama') && (
              <div style={{ margin: '0.6rem 0' }}>
                <p style={{ marginBottom: '0.3rem' }}>¿Hay hojarasca o rastrojo seco tapando el suelo?{foto.hojarasca && foto.descripcion ? ' (sugerido por la foto, corrígelo si no es así)' : ''}</p>
                <div className="chips">
                  {(['mucha', 'poca', 'nada'] as const).map((h) => (
                    <button key={h} className="chip" aria-pressed={foto.hojarasca === h}
                      onClick={() => cambiar({ fotos: exp.fotos.map((x) => x.tipo === f.tipo ? { ...x, hojarasca: h } : x) })}>{h[0].toUpperCase() + h.slice(1)}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="fila">
              <label className="boton claro">
                {midiendo === f.tipo ? 'Midiendo…' : foto ? 'Cambiar foto' : 'Tomar foto'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => tomar(f.tipo, e.target.files?.[0])} />
              </label>
              {foto && <button className="boton claro" onClick={() => cambiar({ fotos: exp.fotos.filter((x) => x.tipo !== f.tipo) })}>Quitar</button>}
            </div>
          </div>
        )
      })}
      <div id="infiltracion" style={{ margin: '1.2rem 0' }}>
        <h3>La prueba de la lata con agua</h3>
        <p className="nota">Es la prueba de infiltración del USDA, hecha con una lata. Quítale el fondo y la tapa a una lata de unos 15 cm de ancho y entiérrala 7 a 8 cm en la cama de yuca. Echa casi dos tazas de agua (450 mL) y espera a que se vaya. Después echa otras dos tazas y mide con el cronómetro cuántos minutos tarda esta segunda vez.</p>
        <label>Minutos de la segunda vez:{' '}
          <input type="number" inputMode="decimal" min="0" max="2000" step="0.5" style={{ width: '6em', padding: '0.4em' }}
            value={exp.infiltracion_min ?? ''} onChange={(e) => cambiar({ infiltracion_min: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
        {exp.infiltracion_min != null && <p>Según la tabla del USDA, el agua entra de forma <strong>{claseInfil(exp.infiltracion_min)}</strong>.</p>}
      </div>
      <div id="riego">
        <h3>¿Riegas en verano?</h3>
        <div className="chips">
          {(['no', 'a veces', 'si'] as const).map((r) => (
            <button key={r} className="chip" aria-pressed={exp.riego === r} onClick={() => cambiar({ riego: exp.riego === r ? '' : r })}>{r === 'si' ? 'Sí' : r[0].toUpperCase() + r.slice(1)}</button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Satelite({ lugar, desde, exp }: { lugar: Lugar; desde: number; exp: Expediente }) {
  const prom = lugar.ninos.promedio
  const seco = prom.filter((p) => [1, 2, 3].includes(p.mes)).map((p) => p.pct_normal ?? 100)
  const pctSeco = Math.round(seco.reduce((a, b) => a + b, 0) / (seco.length || 1))
  const rec = lugar.reciente_imerg ?? lugar.reciente_power
  const esImerg = !!lugar.reciente_imerg
  const f = (k: string) => lugar.fuentes[k]
  const ultimoNdvi = lugar.ndvi?.ultimo
  return (
    <section className="seccion" aria-labelledby="t-sat">
      <header><h2 id="t-sat">Lo que dice el satélite</h2><span className="estado">{lugar.pendiente.length ? 'bajando datos' : 'al día'}</span></header>

      <h3>La lluvia de tu zona y El Niño</h3>
      <p>Barras azules: lo que llueve normalmente cada mes. Raya ocre: lo que el sol y el calor le sacan al suelo (ET₀). Rayado: cómo llovió en los Niños fuertes de 1982, 1997, 2015 y 2023.</p>
      <BarrasLluvia normales={lugar.normales} ninos={lugar.ninos} desde={desde} />
      <p>En esos cuatro Niños, de enero a marzo llovió en promedio el <strong>{pctSeco}%</strong> de lo normal. Es la memoria de tu zona, no un pronóstico.</p>
      <p><button className="fuente" title={f('power')?.consultado}>{f('power')?.producto}, celda {f('power')?.celda}</button></p>

      <h3 style={{ marginTop: '1.4rem' }}>Los últimos días</h3>
      <Reciente dias={rec.dias.slice(-45)} />
      {esImerg && lugar.reciente_imerg ? (
        <p><span className="cifra">{lugar.reciente_imerg.racha_seca_dias}</span> días seguidos sin lluvia hasta el {lugar.reciente_imerg.hasta.split('-').reverse().join('/')}</p>
      ) : (
        <p className="nota">NASA POWER llega hasta el {rec.hasta.split('-').reverse().join('/')} y reparte la lluvia en una celda de 55 km, así que casi nunca marca cero. La lluvia de satélite (IMERG) está en camino.</p>
      )}

      <h3 style={{ marginTop: '1.4rem' }}>Qué tan verde está tu zona</h3>
      {lugar.ndvi ? (
        <>
          <NdviMeses meses={lugar.ndvi.meses} desde={desde} />
          <p>Verdor (NDVI) medio por mes desde el año 2000, con {lugar.ndvi.n_validos} imágenes sin nubes de {lugar.ndvi.n_total}.
            {ultimoNdvi && <> La última, del {ultimoNdvi.fecha.split('-').reverse().join('/')}, dio {ultimoNdvi.valor.toFixed(2)}.</>}</p>
          <p className="nota">Ese píxel de 250 m incluye techos, calles y árboles. Si tu foto debajo del cacao sale con suelo desnudo, el satélite está viendo la copa, no el suelo.</p>
          <p><button className="fuente">{f('ndvi')?.producto}</button></p>
        </>
      ) : <p className="nota">Bajando 26 años de imágenes MODIS de tu punto. Tarda unos minutos la primera vez.</p>}

      <h3 style={{ marginTop: '1.4rem' }}>Lo que ve cada satélite</h3>
      <Suspense fallback={<div className="mapa" />}><Mapa lat={lugar.punto.lat} lon={lugar.punto.lon} /></Suspense>
      <p className="nota">Punto redondeado a ~1 km ({exp.lat.toFixed(2)}, {exp.lon.toFixed(2)}): tu casa exacta no se manda a ningún lado.</p>
    </section>
  )
}

function TuParcela({ exp, cambiar }: { exp: Expediente; cambiar: (p: Partial<Expediente>) => void }) {
  const alternar = (k: 'cultivos' | 'prioridades', v: string) =>
    cambiar({ [k]: exp[k].includes(v) ? exp[k].filter((x) => x !== v) : [...exp[k], v] })
  const ubicar = () => navigator.geolocation?.getCurrentPosition(
    (p) => cambiar({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
    () => alert('No se pudo leer la ubicación. Revisa el permiso del navegador.'),
  )
  return (
    <section className="seccion" aria-labelledby="t-parcela" id="parcela">
      <header><h2 id="t-parcela">Tu parcela</h2><span className={`estado ${exp.prioridades.length ? 'listo' : 'falta'}`}>{exp.prioridades.length ? 'lista' : 'falta lo que te importa'}</span></header>
      <label className="nota" htmlFor="nombre">Nombre</label>
      <input id="nombre" value={exp.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} style={{ width: '100%', padding: '0.5em', marginBottom: '1rem' }} />
      <h3>Qué tienes sembrado</h3>
      <div className="chips">{CULTIVOS.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.cultivos.includes(k)} onClick={() => alternar('cultivos', k)}>{n}</button>)}</div>
      <h3 style={{ marginTop: '1.2rem' }} id="prioridades">Qué te importa más</h3>
      <div className="chips">{PRIORIDADES.map(([k, n]) => <button key={k} className="chip" aria-pressed={exp.prioridades.includes(k)} onClick={() => alternar('prioridades', k)}>{n}</button>)}</div>
      <h3 style={{ marginTop: '1.2rem' }}>Dónde está</h3>
      <p className="nota">Se guarda redondeado a ~1 km.</p>
      <button className="boton claro" onClick={ubicar}>Usar mi ubicación</button>
    </section>
  )
}

function Compartir({ exp, cambiar }: { exp: Expediente; cambiar: (p: Partial<Expediente>) => void }) {
  const [enlace, setEnlace] = useState('')
  const sinFotos = useMemo(() => ({ ...exp, fotos: exp.fotos.map(({ miniatura: _m, ...f }) => ({ ...f, miniatura: '' })) }), [exp])
  const compartir = async () => {
    const r = exp.id
      ? (await pedir(`/api/expediente/${exp.id}`, { method: 'PUT', body: JSON.stringify({ datos: sinFotos }) }), { id: exp.id })
      : await pedir<{ id: string }>('/api/expediente', { method: 'POST', body: JSON.stringify({ datos: sinFotos }) })
    cambiar({ id: r.id })
    const url = `${location.origin}/?e=${r.id}`
    setEnlace(url)
    navigator.share?.({ title: exp.nombre, url }).catch(() => { /* cancelado */ })
  }
  return (
    <section className="seccion" aria-labelledby="t-comp2">
      <header><h2 id="t-comp2">Revisarlo con un técnico</h2></header>
      <p>Comparte este expediente. El técnico ve lo mismo que tú y puede dejar notas. Las fotos se quedan en tu celular; solo se manda su medición.</p>
      <button className="boton" onClick={compartir}>Compartir expediente</button>
      {enlace && <p><a href={enlace}>{enlace}</a></p>}
    </section>
  )
}
