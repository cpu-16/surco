"""API de la herramienta. Uso: uv run uvicorn app:app --port 8787"""
import datetime as dt
import hashlib
import json
import secrets
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

import earthdata
import motor
import nasa
import pronostico

AQUI = Path(__file__).parent
app = FastAPI(title="Patio API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])
_pool = ThreadPoolExecutor(3)  # ORNL: lento, minutos por serie
_rapido = ThreadPoolExecutor(2)  # Earthdata (IMERG, AppEEARS): segundos; no hace cola detrás de ORNL
_trabajos: dict = {}


def redondear(lat: float, lon: float) -> tuple[float, float]:
    """Privacidad: nunca se consulta ni se guarda un punto más fino que ~1 km."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "Coordenadas fuera de rango")
    return round(lat, 2), round(lon, 2)


_ultimo: dict = {}


def _en_fondo(clave, fn, *args, base=None, pool=None):
    """Devuelve el resultado si ya está; si no, lo deja corriendo y responde None.
    Con `base`, mientras se calcula la versión nueva responde la última buena (la lluvia de hace 3 h vale más que nada)."""
    f = _trabajos.get(clave)
    if f is None or (f.done() and f.exception()):
        f = _trabajos[clave] = (pool or _pool).submit(fn, *args)
    r = f.result() if f.done() and not f.exception() else None
    if base is not None:
        if r is not None:
            _ultimo[base] = r
        r = r if r is not None else _ultimo.get(base)
    return r


@app.get("/api/lugar")
def lugar(lat: float = Query(...), lon: float = Query(...)):
    lat, lon = redondear(lat, lon)
    p = nasa.power(lat, lon)
    normales = motor.clima_mensual(p["dias"])
    out = {"punto": {"lat": lat, "lon": lon, "elevacion_m": p["elevacion_m"]},
           "fuentes": {"power": p["meta"]},
           "normales": normales, "ninos": motor.ninos(p["dias"], normales), "reciente_power": motor.reciente(p["dias"]),
           "lluvia_mensual": {k: round(v) for k, v in motor.lluvia_mensual(p["dias"]).items() if k >= "2020-01"},
           "pendiente": []}
    clave_pronostico = ("pronostico", lat, lon, dt.date.today(), time.time() // 10800)
    out["pronostico"] = _en_fondo(clave_pronostico, pronostico.lluvia, lat, lon, pool=_rapido)
    trabajo = _trabajos.get(clave_pronostico)
    if out["pronostico"] is None and (trabajo is None or not trabajo.done()):
        out["pendiente"].append("pronostico")
    ndvi = _en_fondo(("ndvi", lat, lon), nasa.ornl, "ndvi", lat, lon)
    fiab = _en_fondo(("fiabilidad", lat, lon), nasa.ornl, "fiabilidad", lat, lon)
    if ndvi and fiab:
        out["ndvi"] = motor.ndvi_estacional(ndvi["datos"], fiab["datos"])
        out["ndvi"]["serie"] = [f for f in ndvi["datos"] if f["fecha"] >= "2023-01-01"]
        out["fuentes"]["ndvi"] = ndvi["meta"]
    else:
        out["pendiente"].append("ndvi")
        pn, pf = nasa.PARCIAL.get(("ndvi", lat, lon)), nasa.PARCIAL.get(("fiabilidad", lat, lon))
        if pn and pn["filas"]:  # mientras baja la serie de 26 años, lo que ya llegó (lo más nuevo primero)
            out["ndvi"] = motor.ndvi_estacional(pn["filas"], pf["filas"] if pf and pf["filas"] else None)
            out["ndvi"]["progreso"] = [pn["hechos"], pn["total"]]
    for var, desde in (("et", "2018-01-01"), ("pet", "2018-01-01"), ("lst", "2018-01-01")):
        s = _en_fondo((var, lat, lon), nasa.ornl, var, lat, lon, desde)
        if s:
            out[var] = s["datos"][-46:]  # ~1 año de compuestos de 8 días
            out["fuentes"][var] = s["meta"]
        else:
            out["pendiente"].append(var)
    # Con cuenta Earthdata: lluvia IMERG de los últimos días y el pedido de AppEEARS (HLS, SMAP, ECOSTRESS, NASADEM)
    if earthdata.hay_cuenta():
        hoy = dt.date.today()
        im = _en_fondo(("imerg", lat, lon, hoy, time.time() // 10800), earthdata.imerg, lat, lon, hoy - dt.timedelta(days=60), hoy, base=("imerg", lat, lon), pool=_rapido)
        if im and im["dias"]:
            out["reciente_imerg"] = motor.reciente([{"fecha": d["fecha"], "PRECTOTCORR": d["lluvia"]} for d in im["dias"]])
            out["fuentes"]["imerg"] = im["meta"]
        else:
            out["pendiente"].append("imerg")
        ae = _en_fondo(("appeears", lat, lon, time.time() // 600), earthdata.appeears, lat, lon, base=("appeears", lat, lon), pool=_rapido)
        if ae:
            out["appeears"] = motor.resumen_appeears(ae)
        else:
            out["pendiente"].append("appeears")
    else:
        out["sin_cuenta"] = True
    return out


# ---------- Expediente compartido (productor + técnico) ----------

def _db():
    c = sqlite3.connect(AQUI / "expedientes.sqlite", timeout=30)
    c.execute("create table if not exists exp(id text primary key, datos text, actualizado real)")
    if "clave" not in {r[1] for r in c.execute("pragma table_info(exp)")}:
        c.execute("alter table exp add column clave text")  # sha256 de la clave de edición; null = expediente viejo
    c.execute("create table if not exists version(id text, n integer, datos text, fecha real, primary key (id, n))")
    return c


def _hash(clave: str) -> str:
    return hashlib.sha256(clave.encode()).hexdigest()


def _version(c, i, datos):
    """Cada guardado queda como versión fechada: la decisión de hoy no se pierde aunque mañana cambie."""
    n = c.execute("select coalesce(max(n), 0) + 1 from version where id=?", (i,)).fetchone()[0]
    c.execute("insert into version values (?,?,?,?)", (i, n, json.dumps(datos), time.time()))
    return n


class Expediente(BaseModel):
    datos: dict


def _tope(datos):
    if len(json.dumps(datos)) > 200_000:
        raise HTTPException(413, "Expediente demasiado grande")


@app.post("/api/expediente")
def crear(e: Expediente):
    """Sin cuentas: el que crea recibe una clave de edición que se queda en su celular; el enlace solo deja consultar y dejar notas."""
    _tope(e.datos)
    i, clave = secrets.token_urlsafe(8), secrets.token_urlsafe(16)
    with _db() as c:
        c.execute("insert into exp values (?,?,?,?)", (i, json.dumps(e.datos), time.time(), _hash(clave)))
        n = _version(c, i, e.datos)
    return {"id": i, "clave": clave, "version": n}


@app.get("/api/expediente/{i}")
def leer(i: str):
    with _db() as c:
        r = c.execute("select datos, actualizado from exp where id=?", (i,)).fetchone()
        vs = c.execute("select n, fecha from version where id=? order by n", (i,)).fetchall()
    if not r:
        raise HTTPException(404, "No existe ese expediente")
    return {"id": i, "datos": json.loads(r[0]), "actualizado": r[1], "versiones": [{"n": n, "fecha": f} for n, f in vs]}


@app.get("/api/expediente/{i}/version/{n}")
def leer_version(i: str, n: int):
    with _db() as c:
        r = c.execute("select datos, fecha from version where id=? and n=?", (i, n)).fetchone()
    if not r:
        raise HTTPException(404, "No existe esa versión")
    return {"id": i, "n": n, "datos": json.loads(r[0]), "fecha": r[1]}


@app.put("/api/expediente/{i}")
def guardar(i: str, e: Expediente, x_clave: str = Header("")):
    _tope(e.datos)
    with _db() as c:
        r = c.execute("select clave, datos from exp where id=?", (i,)).fetchone()
        if not r:
            raise HTTPException(404, "No existe ese expediente")
        if r[0] and not secrets.compare_digest(r[0], _hash(x_clave)):
            raise HTTPException(403, "Solo quien creó el registro puede cambiarlo. Puedes dejar una nota.")
        notas = json.loads(r[1]).get("notas", [])  # las notas del técnico viven en el servidor: el celular no las borra
        datos = {**e.datos, "notas": notas + [x for x in e.datos.get("notas", []) if x not in notas]}
        c.execute("update exp set datos=?, actualizado=? where id=?", (json.dumps(datos), time.time(), i))
        n = _version(c, i, datos)
    return {"ok": True, "version": n}


class Nota(BaseModel):
    quien: str = "tecnico"
    nombre: str = ""
    texto: str


@app.post("/api/expediente/{i}/nota")
def anotar(i: str, nota: Nota):
    """Quien tenga el enlace (el técnico, la cooperativa) deja una nota fechada. No cambia nada más del registro."""
    texto = nota.texto.strip()[:1000]
    if not texto:
        raise HTTPException(400, "La nota está vacía")
    with _db() as c:
        r = c.execute("select datos from exp where id=?", (i,)).fetchone()
        if not r:
            raise HTTPException(404, "No existe ese expediente")
        datos = json.loads(r[0])
        if len(datos.get("notas", [])) >= 200:
            raise HTTPException(413, "Este registro ya tiene demasiadas notas")
        datos.setdefault("notas", []).append({"quien": "tecnico" if nota.quien != "productor" else "productor", "nombre": nota.nombre.strip()[:80],
                                              "texto": texto, "fecha": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")})
        c.execute("update exp set datos=?, actualizado=? where id=?", (json.dumps(datos), time.time(), i))
    return {"ok": True, "notas": datos["notas"]}


# ---------- Comparación e IA ----------
from fastapi import File, Form, UploadFile  # noqa: E402

import ia  # noqa: E402


class Idioma(BaseModel):
    lang: str = "es"

    @field_validator("lang", mode="before")
    @classmethod
    def validar_lang(cls, value):
        return "en" if value == "en" else "es"


class Pedido(Idioma):
    expediente: dict


def _clima(exp):
    lat, lon = redondear(float(exp.get("lat", 8.1)), float(exp.get("lon", -80.98)))
    p = nasa.power(lat, lon)
    n = motor.clima_mensual(p["dias"])
    return n, motor.ninos(p["dias"], n)


@app.get("/api/cultivos")
def cultivos(lang: str = "es"):
    return [{"id": clave, "nombre": motor.nombre_cultivo(clave, lang),
             "cientifico": c["cientifico"], "tipo": c["tipo"], "alias": c["alias"]}
            for clave, c in motor.AGRO["cultivos"].items()]


@app.post("/api/comparar")
def comparar(pd: Pedido):
    n, ni = _clima(pd.expediente)
    return motor.comparar(pd.expediente, n, ni["promedio"], lang=pd.lang)


@app.post("/api/ia/foto")
async def ia_foto(foto: UploadFile = File(...), tipo: str = Form("general"), lang: str = Form("es")):
    datos = await foto.read()
    try:
        return await run_in_threadpool(ia.foto, datos, tipo[:20], "en" if lang == "en" else "es")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(503, "El asistente no pudo ver la foto ahora")


class Charla(Idioma):
    historia: list
    expediente: dict
    comparacion: dict | None = None
    lugar: dict | None = None


def _foto_ia(f: dict) -> dict:
    """La foto con su nombre real; el verde de la planta o del patio entero no es suelo tapado, así que no se lo pasa."""
    g = {**f, "tipo": ia.TIPOS.get(f.get("tipo"), f.get("tipo"))}
    if f.get("tipo") not in ("cama", "perennes"):
        g.pop("cobertura", None)
    return g


@app.post("/api/ia/pregunta")
async def ia_pregunta(c: Charla):
    comp = c.comparacion or {}
    # al asistente solo le llega lo calculado, sin las tiras mes a mes completas para no inflar el contexto
    resumen = [{k: e.get(k) for k in ("nombre", "detalle", "n_kg_ha", "familias", "agua", "razon", "beneficios", "vacios", "riesgos", "ajustes")}
               | {"meses_pelados_huerto": e.get("desnudo_cama"), "meses_pelados_bajo_arboles": e.get("desnudo_arboles")}
               | {"meses": [f"{m['mes']}:{m.get('nombre') or 'desnudo'}/{m['cobertura']}" for m in e.get("tira", [])]}
               for e in comp.get("estrategias", [])]
    expediente = {**c.expediente, "pais": "PA" if ia.es_panama(c.expediente) else None,
                  "fotos": [_foto_ia(f) for f in c.expediente.get("fotos", []) if isinstance(f, dict)]}
    ctx = {"expediente": expediente, "estrategias": resumen, "lectura": comp.get("lectura"), "clima_nasa": c.lugar,
           "pina_no_crece": motor.AGRO.get("piña_no_crece") if ia.es_panama(expediente) and "pina" in motor._seleccion(expediente)[0] else None}
    try:
        r = await run_in_threadpool(ia.pregunta, c.historia, ctx, c.lang)
        prop = r.get("propuesta") if isinstance(r, dict) else None
        if isinstance(prop, dict):  # «maíz» o «ahuyama» de la charla → la clave del catálogo, igual que en el paso 1
            if isinstance(prop.get("cultivos"), list):
                prop["cultivos"] = [motor.buscar_cultivo(str(x)) or str(x).lower() for x in prop["cultivos"]]
            if isinstance(prop.get("siembras"), dict):
                prop["siembras"] = {motor.buscar_cultivo(str(k)) or str(k).lower(): v for k, v in prop["siembras"].items()}
        return r
    except Exception as e:
        raise HTTPException(503, str(e) if "cupo" in str(e) else "El asistente no está disponible ahora")
