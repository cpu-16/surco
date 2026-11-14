"""API de la herramienta. Uso: uv run uvicorn app:app --port 8787"""
import datetime as dt
import json
import secrets
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import earthdata
import motor
import nasa

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
    return c


class Expediente(BaseModel):
    datos: dict


@app.post("/api/expediente")
def crear(e: Expediente):
    i = secrets.token_urlsafe(8)
    with _db() as c:
        c.execute("insert into exp values (?,?,?)", (i, json.dumps(e.datos), time.time()))
    return {"id": i}


@app.get("/api/expediente/{i}")
def leer(i: str):
    with _db() as c:
        r = c.execute("select datos, actualizado from exp where id=?", (i,)).fetchone()
    if not r:
        raise HTTPException(404, "No existe ese expediente")
    return {"id": i, "datos": json.loads(r[0]), "actualizado": r[1]}


@app.put("/api/expediente/{i}")
def guardar(i: str, e: Expediente):
    if len(json.dumps(e.datos)) > 200_000:
        raise HTTPException(413, "Expediente demasiado grande")
    with _db() as c:
        n = c.execute("update exp set datos=?, actualizado=? where id=?", (json.dumps(e.datos), time.time(), i)).rowcount
    if not n:
        raise HTTPException(404, "No existe ese expediente")
    return {"ok": True}


# ---------- Comparación e IA ----------
from fastapi import File, Form, UploadFile  # noqa: E402

import ia  # noqa: E402


class Pedido(BaseModel):
    expediente: dict


def _clima(exp):
    lat, lon = redondear(float(exp.get("lat", 8.1)), float(exp.get("lon", -80.98)))
    p = nasa.power(lat, lon)
    n = motor.clima_mensual(p["dias"])
    return n, motor.ninos(p["dias"], n)


@app.post("/api/comparar")
def comparar(pd: Pedido):
    n, ni = _clima(pd.expediente)
    return motor.comparar(pd.expediente, n, ni["promedio"])


@app.post("/api/ia/foto")
async def ia_foto(foto: UploadFile = File(...), tipo: str = Form("general")):
    datos = await foto.read()
    try:
        return await run_in_threadpool(ia.foto, datos, tipo[:20])
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(503, "El asistente no pudo ver la foto ahora")


class Charla(BaseModel):
    historia: list
    expediente: dict
    comparacion: dict | None = None
    lugar: dict | None = None


@app.post("/api/ia/pregunta")
async def ia_pregunta(c: Charla):
    comp = c.comparacion or {}
    # al asistente solo le llega lo calculado, sin las tiras mes a mes completas para no inflar el contexto
    resumen = [{k: e.get(k) for k in ("nombre", "meses_desnudo", "n_kg_ha", "familias", "agua", "razon", "beneficios", "vacios", "riesgos", "ajustes")}
               | {"meses": [f"{m['mes']}:{m.get('nombre') or 'desnudo'}/{m['cobertura']}" for m in e.get("tira", [])]}
               for e in comp.get("estrategias", [])]
    ctx = {"expediente": c.expediente, "estrategias": resumen, "lectura": comp.get("lectura"), "clima_nasa": c.lugar,
           "pina_no_crece": motor.AGRO.get("piña_no_crece")}
    try:
        return await run_in_threadpool(ia.pregunta, c.historia, ctx)
    except Exception as e:
        raise HTTPException(503, str(e) if "cupo" in str(e) else "El asistente no está disponible ahora")
