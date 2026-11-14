"""Series de datos NASA para un punto. Cada respuesta cruda se guarda en SQLite con su URL y la hora de consulta,
así la app puede citar exactamente de dónde salió cada número y no vuelve a pedir lo que ya no cambia."""
import datetime as dt
import json
import math
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

DB = Path(__file__).parent / "cache.sqlite"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
ORNL_URL = "https://modis.ornl.gov/rst/api/v1"
POWER_VARS = "PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,RH2M,WS2M,ALLSKY_SFC_SW_DWN,GWETROOT,GWETTOP"
NUNCA = 10**9  # ttl para datos que ya no cambian


def _db():
    c = sqlite3.connect(DB, timeout=30)
    c.execute("create table if not exists cache(url text primary key, cuerpo text, consultado real)")
    return c


def _get(url: str, params: dict, ttl_h: float, timeout=120) -> tuple[dict, str, float]:
    """GET con caché. Devuelve (json, url_completa, epoch_consulta)."""
    full = str(httpx.URL(url, params=params))
    with _db() as c:
        row = c.execute("select cuerpo, consultado from cache where url=?", (full,)).fetchone()
    if row and time.time() - row[1] < ttl_h * 3600:
        return json.loads(row[0]), full, row[1]
    for intento in range(3):
        try:
            r = httpx.get(full, headers={"Accept": "application/json"}, timeout=timeout)
            r.raise_for_status()
            break
        except httpx.HTTPError:
            if intento == 2:
                if row:  # ponytail: si NASA no responde, servimos lo último guardado y se nota por la fecha
                    return json.loads(row[0]), full, row[1]
                raise
            time.sleep(10 * (intento + 1))  # ORNL responde 503 cuando está cargado
    with _db() as c:
        c.execute("insert or replace into cache values (?,?,?)", (full, r.text, time.time()))
    return r.json(), full, time.time()


def _meta(producto, celda, url, t, unidades):
    return {"producto": producto, "celda": celda, "url": url,
            "consultado": dt.datetime.fromtimestamp(t).isoformat(timespec="minutes"), "unidades": unidades}


# ---------- NASA POWER (MERRA-2 + satélite, ~0.5°) ----------

def power(lat: float, lon: float, desde=dt.date(1981, 1, 1), hasta: dt.date | None = None) -> dict:
    """Clima diario. El historial hasta el año pasado se guarda para siempre; el año en curso se refresca cada 6 h."""
    hasta = hasta or dt.date.today()
    corte = dt.date(hasta.year, 1, 1)
    tramos = [(desde, corte - dt.timedelta(days=1), NUNCA), (corte, hasta, 6)] if desde < corte else [(desde, hasta, 6)]
    dias, urls, t = {}, [], 0
    for a, b, ttl in tramos:
        j, url, t = _get(POWER_URL, {"parameters": POWER_VARS, "community": "AG", "latitude": lat, "longitude": lon,
                                     "start": a.strftime("%Y%m%d"), "end": b.strftime("%Y%m%d"), "format": "JSON"}, ttl)
        urls.append(url)
        p = j["properties"]["parameter"]
        fill = j["header"].get("fill_value", -999)
        for v, serie in p.items():
            for d, x in serie.items():
                dias.setdefault(d, {})[v] = None if x == fill else x
        unidades = {k: v.get("units") for k, v in j.get("parameters", {}).items()}
        elev = j["geometry"]["coordinates"][2] if len(j["geometry"]["coordinates"]) > 2 else None
    filas = [{"fecha": f"{d[:4]}-{d[4:6]}-{d[6:]}", **v} for d, v in sorted(dias.items())]
    # Los últimos días llegan vacíos hasta que POWER los procesa (~3 días de atraso): se recortan.
    while filas and filas[-1].get("PRECTOTCORR") is None:
        filas.pop()
    for f in filas:
        f["ET0"] = et0_fao56(f, lat, elev or 100)
    return {"meta": _meta("NASA POWER diario (comunidad AG)", "0.5° × 0.625° (~55 km)", urls, t, unidades),
            "elevacion_m": elev, "dias": filas}


def et0_fao56(f: dict, lat: float, z: float) -> float | None:
    """ET₀ de referencia, Penman-Monteith FAO-56 (Allen et al. 1998, ec. 6), con datos diarios de POWER."""
    try:
        tmax, tmin, tm = f["T2M_MAX"], f["T2M_MIN"], f["T2M"]
        rh, u2, rs = f["RH2M"], f["WS2M"], f["ALLSKY_SFC_SW_DWN"]
        if None in (tmax, tmin, tm, rh, u2, rs):
            return None
    except KeyError:
        return None
    j = dt.date.fromisoformat(f["fecha"]).timetuple().tm_yday
    P = 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26
    gamma = 0.000665 * P
    es_ = lambda T: 0.6108 * math.exp(17.27 * T / (T + 237.3))
    es = (es_(tmax) + es_(tmin)) / 2
    ea = es * rh / 100
    delta = 4098 * es_(tm) / (tm + 237.3) ** 2
    phi = math.radians(lat)
    dr = 1 + 0.033 * math.cos(2 * math.pi * j / 365)
    dec = 0.409 * math.sin(2 * math.pi * j / 365 - 1.39)
    ws = math.acos(-math.tan(phi) * math.tan(dec))
    ra = 24 * 60 / math.pi * 0.0820 * dr * (ws * math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.sin(ws))
    rso = (0.75 + 2e-5 * z) * ra
    rns = 0.77 * rs
    rnl = 4.903e-9 * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * math.sqrt(ea)) * (1.35 * min(rs / rso, 1) - 0.35)
    rn = rns - rnl
    et0 = (0.408 * delta * rn + gamma * 900 / (tm + 273) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
    return round(max(et0, 0), 2)


# ---------- ORNL DAAC: MODIS en un píxel ----------

ORNL = {  # producto: (banda, escala, relleno, unidad, celda)
    "ndvi": ("MOD13Q1", "250m_16_days_NDVI", 0.0001, -3000, "NDVI", "250 m, 16 días"),
    "evi": ("MOD13Q1", "250m_16_days_EVI", 0.0001, -3000, "EVI", "250 m, 16 días"),
    "fiabilidad": ("MOD13Q1", "250m_16_days_pixel_reliability", 1, -1, "0 buena · 1 marginal · 3 nube", "250 m"),
    "et": ("MOD16A2GF", "ET_500m", 0.1, 32761, "kg/m²/8 días (= mm/8 días)", "500 m, 8 días"),
    "pet": ("MOD16A2GF", "PET_500m", 0.1, 32761, "kg/m²/8 días (= mm/8 días)", "500 m, 8 días"),
    "lst": ("MOD11A2", "LST_Day_1km", 0.02, 0, "K", "1 km, 8 días"),
}


PARCIAL: dict = {}  # (var, lat, lon) → lo que ya bajó mientras la serie completa sigue en camino
_cerrojo = threading.Lock()


def ornl(var: str, lat: float, lon: float, desde: str = "2000-01-01") -> dict:
    prod, banda, escala, relleno, unidad, celda = ORNL[var]
    # ponytail: las fechas de los compuestos MODIS son las mismas en todo el planeta; pedirlas siempre en el mismo punto
    # las saca de caché (ORNL tarda ~45 s solo en esta lista). Si un píxel no tiene una fecha, el subset la omite.
    fechas, _, _ = _get(f"{ORNL_URL}/{prod}/dates", {"latitude": 8.1, "longitude": -80.98}, 24)
    fechas = [d for d in fechas["dates"] if d["calendar_date"] >= desde]
    tramos = [fechas[i:i + 10] for i in range(0, len(fechas), 10)]  # la API acepta hasta 10 fechas por llamada
    reciente = tramos[-1] if tramos else None
    tramos.reverse()  # lo más nuevo primero: en un minuto ya hay un año para mostrar
    prog = PARCIAL[(var, lat, lon)] = {"filas": [], "hechos": 0, "total": len(tramos)}

    def filas_de(j):
        # MOD16 usa 32761–32767 para casos sin cálculo (urbano, agua, sin vegetación): todos son «sin dato»
        return [{"fecha": s["calendar_date"], "valor": None if (x := s["data"][0]) == relleno or (relleno > 30000 and x >= relleno) else round(x * escala, 4)}
                for s in j.get("subset", [])]

    def seguro(tr):  # un tramo caído (ORNL da 503 seguido) no tumba la serie: queda el hueco y se reintenta otro día
        try:
            r = _get(f"{ORNL_URL}/{prod}/subset", {"latitude": lat, "longitude": lon, "band": banda,
                     "startDate": tr[0]["modis_date"], "endDate": tr[-1]["modis_date"],
                     "kmAboveBelow": 0, "kmLeftRight": 0}, 24 if tr is reciente else NUNCA, timeout=180)
        except httpx.HTTPError:
            r = {"subset": []}, "", 0
        with _cerrojo:
            prog["filas"] = sorted(prog["filas"] + filas_de(r[0]), key=lambda f: f["fecha"])
            prog["hechos"] += 1
        return r

    with ThreadPoolExecutor(3) as ex:  # ponytail: 3 hilos para no saturar ORNL; ~45 s por tramo de 10 fechas
        res = list(ex.map(seguro, tramos))
    filas = prog["filas"]
    t = max((r[2] for r in res), default=time.time())
    return {"meta": _meta(f"{prod} ({banda}) vía ORNL DAAC", celda, f"{ORNL_URL}/{prod}/subset", t, unidad), "datos": filas}


if __name__ == "__main__":
    # Prueba con el centro de Santiago de Veraguas: ET₀ de FAO-56 ejemplo 18 (Bangkok, abril) ≈ 5.7 mm/d
    ej = {"fecha": "2026-04-15", "T2M_MAX": 34.8, "T2M_MIN": 25.6, "T2M": 30.2, "RH2M": 70, "WS2M": 2.0, "ALLSKY_SFC_SW_DWN": 22.07}
    e = et0_fao56(ej, 13.73, 2)
    assert 5.0 < e < 6.5, e
    p = power(8.10, -80.98, dt.date(2026, 10, 1))
    print(p["meta"]["producto"], len(p["dias"]), p["dias"][-1])
