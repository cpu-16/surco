"""Cálculos deterministas sobre las series NASA. La IA nunca calcula: solo lee lo que sale de aquí."""
import datetime as dt
from statistics import mean

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
# Niños fuertes con datos en POWER (desde 1981). Fuente: NOAA CPC, índice ONI.
NINOS = [(1982, "1982-83"), (1997, "1997-98"), (2015, "2015-16"), (2023, "2023-24")]
NORMAL = (1991, 2020)  # periodo normal de la OMM


def _mes(f):
    return int(f["fecha"][5:7])


def clima_mensual(dias: list[dict]) -> list[dict]:
    """Normales 1991-2020 por mes: lluvia y ET₀ en mm/mes, Tmax media y humedad de raíz (0-1) de POWER."""
    por = {}
    for f in dias:
        y = int(f["fecha"][:4])
        if NORMAL[0] <= y <= NORMAL[1]:
            por.setdefault((y, _mes(f)), []).append(f)
    out = []
    for m in range(1, 13):
        anios = [v for (y, mm), v in por.items() if mm == m]
        suma = lambda k: mean(sum(x[k] or 0 for x in v) for v in anios)
        prom = lambda k: mean(x[k] for v in anios for x in v if x[k] is not None)
        out.append({"mes": m, "nombre": MESES[m - 1], "lluvia": round(suma("PRECTOTCORR")), "et0": round(suma("ET0")),
                    "tmax": round(prom("T2M_MAX"), 1), "humedad_raiz": round(prom("GWETROOT"), 2)})
    return out


def lluvia_mensual(dias: list[dict]) -> dict:
    tot = {}
    for f in dias:
        if f["PRECTOTCORR"] is not None:
            k = f["fecha"][:7]
            tot[k] = tot.get(k, 0) + f["PRECTOTCORR"]
    return tot


def ninos(dias: list[dict], normales: list[dict]) -> list[dict]:
    """Lluvia de nov a abr en cada Niño fuerte, como % de lo normal. Es memoria del lugar, no pronóstico."""
    tot = lluvia_mensual(dias)
    out = []
    for y0, nombre in NINOS:
        meses = []
        for i in range(6):  # nov, dic, ene, feb, mar, abr
            m = (10 + i) % 12 + 1
            y = y0 if m >= 11 else y0 + 1
            k = f"{y}-{m:02d}"
            if k in tot:
                n = normales[m - 1]["lluvia"]
                meses.append({"mes": m, "lluvia": round(tot[k]), "pct_normal": round(100 * tot[k] / n) if n else None})
        out.append({"evento": nombre, "meses": meses})
    # promedio de los análogos por mes, para el escenario «si este Niño se porta como los anteriores»
    prom = []
    for i in range(6):
        vals = [e["meses"][i]["pct_normal"] for e in out if len(e["meses"]) > i and e["meses"][i]["pct_normal"] is not None]
        prom.append({"mes": (10 + i) % 12 + 1, "pct_normal": round(mean(vals)) if vals else None})
    return {"eventos": out, "promedio": prom}


def reciente(dias: list[dict], umbral_mm=1.0) -> dict:
    """Últimos 60 días, racha seca al final de la serie y lluvia de los últimos 30 días contra lo normal de esas fechas."""
    ult = [f for f in dias if f["PRECTOTCORR"] is not None][-60:]
    racha = 0
    for f in reversed(ult):
        if f["PRECTOTCORR"] >= umbral_mm:
            break
        racha += 1
    fin = dt.date.fromisoformat(ult[-1]["fecha"])
    clave = lambda d: d.strftime("%m-%d")
    ventana = {clave(fin - dt.timedelta(days=i)) for i in range(30)}
    hist = {}
    for f in dias:
        y = int(f["fecha"][:4])
        if NORMAL[0] <= y <= NORMAL[1] and f["fecha"][5:] in ventana and f["PRECTOTCORR"] is not None:
            hist[y] = hist.get(y, 0) + f["PRECTOTCORR"]
    normal30 = mean(hist.values()) if hist else None
    ult30 = sum(f["PRECTOTCORR"] for f in ult[-30:])
    return {"hasta": ult[-1]["fecha"], "dias": [{"fecha": f["fecha"], "lluvia": round(f["PRECTOTCORR"], 1)} for f in ult],
            "racha_seca_dias": racha, "umbral_mm": umbral_mm, "lluvia_30d": round(ult30),
            "normal_30d": round(normal30) if normal30 else None}


def ndvi_estacional(ndvi: list[dict], fiab: list[dict] | None) -> dict:
    """NDVI medio por mes del año, solo con píxeles de fiabilidad buena o marginal (0-1), y el último valor."""
    ok = {f["fecha"]: f["valor"] for f in (fiab or [])}
    por = {}
    usados = []
    for f in ndvi:
        if f["valor"] is None or (fiab and ok.get(f["fecha"]) not in (0, 1)):
            continue
        usados.append(f)
        por.setdefault(int(f["fecha"][5:7]), []).append(f["valor"])
    meses = [{"mes": m, "ndvi": round(mean(por[m]), 2) if m in por else None, "n": len(por.get(m, []))} for m in range(1, 13)]
    return {"meses": meses, "ultimo": usados[-1] if usados else None, "n_validos": len(usados), "n_total": len(ndvi)}


def lluvia_efectiva(p: float) -> float:
    """Lluvia efectiva mensual, método USDA-SCS simplificado (FAO, CROPWAT)."""
    return p * (125 - 0.2 * p) / 125 if p < 250 else 125 + 0.1 * p


# ---------- Comparación de estrategias ----------
import json
from pathlib import Path

_D = Path(__file__).parent / "datos"
AGRO = json.loads((_D / "cultivos.json").read_text())
ESTR = json.loads((_D / "estrategias.json").read_text())["estrategias"]
NIVEL = {"desnudo": 0, "baja": 1, "media": 2, "alta": 3}
NOMBRES = {"yuca": "Yuca", "caupi": "Caupí", "camote": "Camote", "canavalia": "Canavalia", "maiz": "Maíz", "guandu": "Guandú",
           "mani_forrajero": "Maní forrajero", "frijol_comun": "Frijol", "zapallo": "Zapallo", "mucuna": "Mucuna"}
KC_LEGUMINOSA = {"ini": 0.4, "mid": 1.05, "end": 0.35}  # caupí FAO-56, para leguminosas sin Kc publicado


def _mm(s):  # 'AAAA-MM' -> índice de mes absoluto
    y, m = s.split("-")
    return int(y) * 12 + int(m) - 1


def _ocupa(cultivo, siembra_idx, corte_dias=None):
    """Meses que ocupa un cultivo y su cobertura por etapa: inicial desnudo, desarrollo baja, media = la del cultivo, final baja."""
    c = AGRO["cultivos"][cultivo]
    dias = corte_dias or (max(c["ciclo_dias"]) if c.get("ciclo_dias") else 240)
    et = c.get("etapas_dias") or [20, 40, dias - 90, 30]
    k = dias / sum(et)
    lim = [et[0] * k, (et[0] + et[1]) * k, (et[0] + et[1] + et[2]) * k]
    kc = c["kc"] if c["kc"].get("mid") is not None else KC_LEGUMINOSA
    out = {}
    for i in range(round(dias / 30.4)):
        d = i * 30.4 + 15
        etapa = 0 if d < lim[0] else 1 if d < lim[1] else 2 if d < lim[2] else 3
        cob = ["desnudo", "baja", c.get("cobertura") or "media", "baja"][etapa]
        kcm = [kc["ini"], (kc["ini"] + kc["mid"]) / 2, kc["mid"], (kc["mid"] + kc["end"]) / 2][etapa]
        out[siembra_idx + i] = {"cultivo": cultivo, "nombre": NOMBRES.get(cultivo, c["nombre"]), "cobertura": cob, "kc": kcm}
    return out


def _cobertura_foto(pct):
    return "alta" if pct >= 60 else "media" if pct >= 30 else "baja" if pct >= 10 else "desnudo"


def comparar(exp: dict, normales: list[dict], ninos_prom: list[dict], hoy: dt.date | None = None) -> dict:
    hoy = hoy or dt.date.today()
    i0 = hoy.year * 12 + hoy.month - 1
    horizonte = range(i0, i0 + 12)
    pct_nino = {p["mes"]: (p["pct_normal"] or 100) / 100 for p in ninos_prom}
    fotos = {f["tipo"]: f for f in exp.get("fotos", [])}
    infil = exp.get("infiltracion_min")
    yuca_siembra = exp.get("siembras", {}).get("yuca") or "2026-05"  # supuesto si no lo dice el productor
    prior = exp.get("prioridades") or []
    res = []
    for e in ESTR:
        cama = {}
        for paso in e["cama"]:
            s = _mm(yuca_siembra) if paso["siembra"] == "existente" else _mm(paso["siembra"])
            for k, v in _ocupa(paso["cultivo"], s, paso.get("corte_dias")).items():
                cama.setdefault(k, v)  # ponytail: si dos cultivos chocan, gana el primero (la yuca no se arranca)
        ajustes = []
        tira, arboles = [], []
        for idx in horizonte:
            mes = idx % 12 + 1
            m = cama.get(idx) or ({"cultivo": None, "nombre": "acolchado", "cobertura": "baja", "kc": 0}
                                  if e["huecos"] == "acolchado" else {"cultivo": None, "nombre": None, "cobertura": "desnudo", "kc": 0})
            m = {**m, "mes": mes}
            if idx == i0 and "cama" in fotos:  # el dato de campo manda sobre el supuesto en el mes de la foto
                m["cobertura"] = _cobertura_foto(fotos["cama"]["cobertura"])
                m["medido"] = True
            tira.append(m)
            a = {"mes": mes, "cultivo": None}
            if e["arboles"] == "mani_forrajero":
                siembra = _mm("2027-05")  # con las lluvias; tarda ~3 meses en cerrar
                a.update(nombre="acolchado" if idx < siembra else "maní forrajero", cobertura="alta" if idx >= siembra + 3 else "baja")
            elif e["arboles"] == "acolchado":
                a.update(nombre="acolchado", cobertura="baja")
            else:
                a.update(nombre=None, cobertura="desnudo")
            arboles.append(a)
        # la foto debajo de los árboles corrige el supuesto de la estrategia actual
        if e["id"] == "actual" and "perennes" in fotos:
            pct = fotos["perennes"]["cobertura"]
            hoj = fotos["perennes"].get("hojarasca")
            cob = _cobertura_foto(pct)
            if hoj == "mucha" and NIVEL[cob] < 2:
                cob = "media"
            elif hoj == "poca" and NIVEL[cob] < 1:
                cob = "baja"
            if cob != "desnudo":
                for a in arboles:
                    a.update(nombre="lo que tienes hoy", cobertura=cob, medido=True)
                ajustes.append(f"Tu foto debajo de los árboles midió {pct}% de planta verde"
                               + (f" y dijiste que hay {hoj} hojarasca" if hoj else "")
                               + ". Ya no se cuenta como suelo desnudo.")
            else:
                ajustes.append(f"Tu foto confirma el suelo desnudo debajo de los árboles ({pct}% de planta verde). El satélite no lo puede ver porque mira la copa.")
        # agua: lo que pide el cultivo de la cama contra la lluvia efectiva, en año normal y en uno como los Niños
        def deficit(factor):
            tot = 0
            for m in tira:
                n = normales[m["mes"] - 1]
                p = n["lluvia"] * (factor.get(m["mes"], 1) if factor else 1)
                tot += max(0, m["kc"] * n["et0"] - lluvia_efectiva(p))
            return round(tot)
        seca = [m for m in tira if m["mes"] in (12, 1, 2, 3, 4)]
        n_fij = [AGRO["cultivos"][c]["fija_n_kg_ha"] for c in {m["cultivo"] for m in tira if m["cultivo"]} | ({"mani_forrajero"} if e["arboles"] == "mani_forrajero" else set())
                 if AGRO["cultivos"][c].get("fija_n_kg_ha")]
        familias = {AGRO["cultivos"][m["cultivo"]]["familia"] for m in tira if m["cultivo"]}
        desn_cama = sum(m["cobertura"] == "desnudo" for m in tira)
        desn_arb = sum(a["cobertura"] == "desnudo" for a in arboles)
        riesgos = list(e["riesgos"])
        if infil is not None and infil >= 60:
            riesgos.append("Tu prueba de la lata dio infiltración lenta: el agua se queda arriba. Piña y camote sufren con encharcamiento; considera sembrar en camellón.")
            if e["id"] == "guandu_mani":
                ajustes.append(f"Tu suelo dejó entrar el agua muy despacio ({infil:g} minutos). La raíz profunda del guandú es lo que más ayuda a abrirlo.")
        elif infil is not None and infil < 5:
            ajustes.append(f"El agua entró rápido ({infil:g} minutos): el suelo drena bien pero guarda poca humedad. Tapar el suelo pesa más en el verano.") if e["huecos"] == "acolchado" else None
        res.append({
            "id": e["id"], "nombre": e["nombre"], "aplica_a": "cama y árboles",
            "tira": tira, "arboles": arboles, "meses_desnudo": desn_cama + desn_arb,
            "desnudo_cama": desn_cama, "desnudo_arboles": desn_arb,
            "n_kg_ha": [sum(x[0] for x in n_fij), sum(x[1] for x in n_fij)] if n_fij else None,
            "familias": len(familias),
            "agua": {"demanda_seca_mm": round(sum(m["kc"] * normales[m["mes"] - 1]["et0"] for m in seca)),
                     "deficit_normal_mm": deficit(None), "deficit_nino_mm": deficit(pct_nino)},
            "razon": e["razon"], "beneficios": e["beneficios"], "vacios": e["vacios"] + ([] if exp.get("siembras", {}).get("yuca") else ["Se supuso que la yuca se sembró en mayo de 2026."]),
            "riesgos": riesgos, "ajustes": [a for a in ajustes if a],
            "evidencia": [{"id": k, "titulo": AGRO["fuentes"][k]["titulo"], "url": AGRO["fuentes"][k]["url"]} for k in e["evidencia"] if k in AGRO["fuentes"]],
        })
    return {"estrategias": res, "faltan": faltan(exp), "lectura": lectura(res, prior)}


def lectura(res, prior):
    """Qué estrategia sale mejor según lo que le importa al productor. Se admite empate."""
    agua = {r["agua"]["deficit_nino_mm"] for r in res}
    nota_agua = ([f"En agua salen iguales este año: la yuca que ya tienes ocupa el verano en las cuatro. Si no riegas, le faltarían "
                  f"unos {res[0]['agua']['deficit_normal_mm']} mm en un verano normal y {res[0]['agua']['deficit_nino_mm']} mm en uno como los Niños anteriores."]
                 if len(agua) == 1 else [])
    if not prior:
        return ["Escoge qué te importa más (abajo, en Tu parcela) y te digo cuál sale mejor para ti."] + nota_agua
    crit = {"suelo": lambda r: (r["meses_desnudo"], -(r["n_kg_ha"] or [0, 0])[0], -r["familias"]),
            "agua": lambda r: (r["agua"]["deficit_nino_mm"],),
            "trabajo": lambda r: (len([1 for a, b in zip(r["tira"], r["tira"][1:]) if a.get("cultivo") != b.get("cultivo") and b.get("cultivo")]),),
            "comida": lambda r: (-len({m["cultivo"] for m in r["tira"] if m["cultivo"]}),),
            "venta": lambda r: (-len({m["cultivo"] for m in r["tira"] if m["cultivo"] in ("yuca", "maiz", "camote", "guandu")}),)}
    puntos = {r["id"]: 0 for r in res}
    for p in prior:
        if p in crit:
            for r in res:  # puesto = cuántas salen estrictamente mejor; los empates comparten puesto
                puntos[r["id"]] += sum(crit[p](o) < crit[p](r) for o in res)
    mejor = min(puntos.values())
    ganadoras = [r["nombre"] for r in res if puntos[r["id"]] == mejor]
    if len(ganadoras) > 1:
        return [f"Con lo que escogiste quedan empatadas: {' y '.join(ganadoras)}. Mira abajo en qué se diferencian."] + nota_agua
    return [f"Con lo que escogiste, la que mejor sale es: {ganadoras[0]}."] + nota_agua


def faltan(exp):
    f = {x["tipo"] for x in exp.get("fotos", [])}
    out = []
    if "perennes" not in f:
        out.append({"clave": "foto_perennes", "texto": "Foto del suelo debajo del cacao o los cítricos",
                    "cambia": "El satélite ve la copa verde de los árboles, no el suelo de abajo. Tu foto dice si ahí hay suelo desnudo."})
    if "cama" not in f:
        out.append({"clave": "foto_cama", "texto": "Foto del suelo de la cama de yuca", "cambia": "Mide cuánto suelo está tapado este mes."})
    if exp.get("infiltracion_min") is None:
        out.append({"clave": "infiltracion", "texto": "La prueba de la lata con agua", "cambia": "Dice si el agua entra o se queda arriba; eso decide entre raíz profunda y acolchado."})
    if not exp.get("siembras", {}).get("yuca"):
        out.append({"clave": "parcela", "texto": "Cuándo sembraste la yuca", "cambia": "Mueve el mes en que la cama queda libre para lo siguiente."})
    if not exp.get("prioridades"):
        out.append({"clave": "prioridades", "texto": "Qué te importa más", "cambia": "Ordena las estrategias según lo tuyo."})
    return out


if __name__ == "__main__":
    assert round(lluvia_efectiva(100)) == 84 and round(lluvia_efectiva(300)) == 155
    print("ok")
