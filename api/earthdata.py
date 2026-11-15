"""Datos NASA que piden cuenta de Earthdata Login. La cuenta se lee de ~/.netrc (como hace earthaccess);
la clave nunca se imprime ni se guarda en otro lado."""
import csv
import datetime as dt
import io
import json
import netrc
import time

import httpx

from nasa import _db, _meta

EDL = "urs.earthdata.nasa.gov"
GIOVANNI = "https://api.giovanni.earthdata.nasa.gov/timeseries"
APPEEARS = "https://appeears.earthdatacloud.nasa.gov/api"


def _cuenta():
    try:
        a = netrc.netrc().authenticators(EDL)
        return (a[0], a[2]) if a else None
    except (FileNotFoundError, netrc.NetrcParseError):
        return None


def hay_cuenta() -> bool:
    return _cuenta() is not None


_token = {"v": None, "t": 0.0}


def _token_edl() -> str:
    """Token de Earthdata Login (dura semanas). Se renueva una vez al día."""
    if _token["v"] and time.time() - _token["t"] < 86400:
        return _token["v"]
    cuenta = _cuenta()
    if not cuenta:
        raise RuntimeError("Falta ~/.netrc con la cuenta de Earthdata")
    r = httpx.post(f"https://{EDL}/api/users/find_or_create_token", auth=cuenta, timeout=60)
    r.raise_for_status()
    _token.update(v=r.json()["access_token"], t=time.time())
    return _token["v"]


def imerg(lat: float, lon: float, desde: dt.date, hasta: dt.date, corrida="E") -> dict:
    """Lluvia diaria GPM IMERG V07 en un punto por Giovanni. Early (E) sale ~4 h después del día UTC;
    Final (F) llega hasta sep-2025."""
    var = {"E": "GPM_3IMERGDE_07_precipitation", "L": "GPM_3IMERGDL_07_precipitation", "F": "GPM_3IMERGDF_07_precipitation"}[corrida]
    params = {"data": var, "location": f"[{lat},{lon}]", "time": f"{desde}T00:00:00/{hasta}T23:59:59"}  # sin «Z»: con ella Giovanni da 500
    url = str(httpx.URL(GIOVANNI, params=params))
    with _db() as c:
        row = c.execute("select cuerpo, consultado from cache where url=?", (url,)).fetchone()
    if row and (corrida == "F" or time.time() - row[1] < 3 * 3600):
        texto, t = row
    else:
        r = httpx.get(url, headers={"Authorization": f"Bearer {_token_edl()}"}, timeout=180)
        r.raise_for_status()
        texto, t = r.text, time.time()
        with _db() as c:
            c.execute("insert or replace into cache values (?,?,?)", (url, texto, t))
    dias = []
    for linea in texto.splitlines():
        p = linea.split(",")
        if len(p) >= 2 and p[0][:2] in ("19", "20"):
            try:
                v = float(p[1])
            except ValueError:
                continue
            dias.append({"fecha": p[0][:10], "lluvia": None if v < -9000 else round(v, 1)})
    nombre = {"E": "Early", "L": "Late", "F": "Final"}[corrida]
    return {"meta": _meta(f"GPM IMERG V07 diario ({nombre}) vía Giovanni", "0.1° (~11 km)", url, t, "mm/día"), "dias": dias}


# ---------- AppEEARS: pedido asíncrono de punto, se lanza una vez y se recoge cuando termina ----------

CAPAS = [
    {"product": "HLSL30_VI.020", "layer": "NDVI"}, {"product": "HLSS30_VI.020", "layer": "NDVI"},
]


def _ae_cabecera():
    cuenta = _cuenta()
    if not cuenta:
        raise RuntimeError("Falta ~/.netrc con la cuenta de Earthdata")
    r = httpx.post(f"{APPEEARS}/login", auth=cuenta, timeout=60)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def appeears(lat: float, lon: float) -> dict | None:
    """Consulta HLS; conserva el último resultado durante su renovación semanal."""
    # ponytail: solo HLS y 180 días: seis capas y años de datos saturaban la cola de NASA.
    clave = f"hls:{lat},{lon}"
    with _db() as c:
        c.execute("create table if not exists tareas(clave text primary key, id text, estado text, cuerpo text, t real)")
        row = c.execute("select id, estado, cuerpo, t from tareas where clave=?", (clave,)).fetchone()
    viejo = json.loads(row[2]) if row and row[2] else None
    if row and row[1] == "done" and time.time() - row[3] <= 7 * 86400:
        return viejo
    try:
        return _appeears_actualizar(lat, lon, clave, row, viejo)
    except Exception:
        if viejo is not None:
            return viejo
        raise


def _appeears_actualizar(lat, lon, clave, row, viejo):
    h = _ae_cabecera()
    if not row or row[1] in ("done", "error", "failed", "killed"):
        d0 = dt.date.today() - dt.timedelta(days=180)
        cuerpo = {"task_type": "point", "task_name": f"surco-{lat}-{lon}", "params": {
            "dates": [{"startDate": d0.strftime("%m-%d-%Y"), "endDate": dt.date.today().strftime("%m-%d-%Y")}],
            "layers": CAPAS, "coordinates": [{"latitude": lat, "longitude": lon, "category": "punto"}]}}
        r = httpx.post(f"{APPEEARS}/task", json=cuerpo, headers=h, timeout=60)
        r.raise_for_status()
        with _db() as c:
            c.execute("insert or replace into tareas values (?,?,?,?,?)", (clave, r.json()["task_id"], "pending", json.dumps(viejo) if viejo is not None else None, time.time()))
        return viejo
    tid = row[0]
    r = httpx.get(f"{APPEEARS}/task/{tid}", headers=h, timeout=60)
    r.raise_for_status()
    estado = r.json().get("status", "pending")
    if estado != "done":
        with _db() as c:
            c.execute("update tareas set estado=? where clave=?", (estado, clave))
        return viejo
    series: dict[str, list] = {}
    r = httpx.get(f"{APPEEARS}/bundle/{tid}", headers=h, timeout=60)
    r.raise_for_status()
    for f in r.json()["files"]:
        if not f["file_name"].endswith("results.csv"):
            continue
        r = httpx.get(f"{APPEEARS}/bundle/{tid}/{f['file_id']}", headers=h, timeout=300, follow_redirects=True)
        r.raise_for_status()
        for fila in csv.DictReader(io.StringIO(r.text)):
            for k, v in fila.items():
                for capa in CAPAS:
                    pref = capa["product"].replace(".", "_")
                    if k.startswith(pref) and k.endswith(capa["layer"]) and v:
                        try:
                            series.setdefault(capa["product"], []).append({"fecha": fila["Date"][:10], "valor": float(v)})
                        except ValueError:
                            pass
    out = {"tarea": tid, "series": series, "consultado": dt.datetime.now().isoformat(timespec="minutes")}
    with _db() as c:
        c.execute("update tareas set estado='done', cuerpo=?, t=? where clave=?", (json.dumps(out), time.time(), clave))
    return out
