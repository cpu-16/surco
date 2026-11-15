"""Pronóstico público, sin datos personales; comparte la caché SQLite de NASA."""
import math
import datetime as dt
import json
import time
import httpx
from nasa import _db, _meta

URL = 'https://api.open-meteo.com/v1/forecast'


def lluvia(lat, lon):
    try:
        url = str(httpx.URL(URL, params={
            'latitude': lat, 'longitude': lon,
            'daily': 'precipitation_sum,precipitation_probability_max',
            'timezone': 'auto', 'forecast_days': 7,
        }))
        with _db() as c:
            row = c.execute('select cuerpo, consultado from cache where url=?', (url,)).fetchone()
        if row and time.time() - row[1] < 10800 and dt.datetime.fromtimestamp(row[1]).date() == dt.date.today():
            datos, t = json.loads(row[0]), row[1]
        else:
            r = httpx.get(url, timeout=10)
            r.raise_for_status()
            datos, t = r.json(), time.time()
            with _db() as c:
                c.execute('insert or replace into cache values (?,?,?)', (url, json.dumps(datos), t))
        daily = datos['daily']
        fechas, valores = daily['time'], daily['precipitation_sum']
        probs = daily.get('precipitation_probability_max') or [None] * 7
        if not len(fechas) == len(valores) == len(probs) == 7:
            return None
        dias = []
        inicio = dt.date.fromisoformat(fechas[0])
        for i, (fecha, valor, prob) in enumerate(zip(fechas, valores, probs)):
            if dt.date.fromisoformat(fecha) != inicio + dt.timedelta(days=i):
                return None
            if not math.isfinite(valor) or valor < 0:
                return None
            if prob is not None and (not math.isfinite(prob) or not 0 <= prob <= 100):
                return None
            dias.append({'fecha': fecha, 'lluvia': round(valor, 1), 'prob': prob})
        return {'meta': _meta('Pronóstico Open-Meteo (modelos GFS/ECMWF/ICON)', '~11 km', url, t, 'mm/día'),
                'dias': dias, 'total_7d': round(sum(valores)),
                'dias_con_lluvia': sum(v >= 1 for v in valores)}
    except Exception:
        # Esta fuente opcional nunca debe impedir consultar el lugar.
        return None
