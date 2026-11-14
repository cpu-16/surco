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


def ninos(dias: list[dict], normales: list[dict]) -> dict:
    """Análogos junio–mayo de cada Niño, por mes local; memoria, no pronóstico.

    Se incluyen los 12 meses para poder calcular la seca de cualquier hemisferio.
    Los meses nov–abr mantienen el mismo año que en la versión anterior.
    """
    tot = lluvia_mensual(dias)
    normal = {n['mes']: n['lluvia'] for n in normales}
    out = []
    for y0, nombre in NINOS:
        meses = []
        for i in range(12):
            m = (5 + i) % 12 + 1
            y = y0 if m >= 6 else y0 + 1
            k = f"{y}-{m:02d}"
            if k in tot:
                n = normal.get(m)
                meses.append({"mes": m, "lluvia": round(tot[k]),
                              "pct_normal": round(100 * tot[k] / n) if n else None})
        out.append({"evento": nombre, "meses": meses})
    prom = []
    for m in range(1, 13):
        vals = [p['pct_normal'] for e in out for p in e['meses']
                if p['mes'] == m and p['pct_normal'] is not None]
        prom.append({"mes": m, "pct_normal": round(mean(vals)) if vals else None})
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
    # la última racha de 2+ días secos en las últimas dos semanas (lo que el productor recuerda: «hace días que no llueve»)
    ultima = None
    dias14 = ult[-14:]
    i = len(dias14) - 1
    while i >= 0:
        if dias14[i]["PRECTOTCORR"] < umbral_mm:
            j = i
            while j >= 0 and dias14[j]["PRECTOTCORR"] < umbral_mm:
                j -= 1
            if i - j >= 2:
                ultima = {"desde": dias14[j + 1]["fecha"], "hasta": dias14[i]["fecha"], "dias": i - j}
                break
            i = j
        i -= 1
    return {"hasta": ult[-1]["fecha"], "dias": [{"fecha": f["fecha"], "lluvia": round(f["PRECTOTCORR"], 1)} for f in ult],
            "racha_seca_dias": racha, "ultima_racha": ultima, "umbral_mm": umbral_mm, "lluvia_30d": round(ult30),
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
ESTR_EN = json.loads((_D / "estrategias.en.json").read_text())["estrategias"]
ESTR = json.loads((_D / "estrategias.json").read_text())["estrategias"]
AGRO["fuentes"].update({  # verificadas el 14-nov-2026 (investigacion/verificacion-suelo.md)
    "USDA": {"titulo": "USDA-NRCS, Soil Quality Test Kit Guide (1999): prueba de infiltración y tabla 3", "url": "https://www.govinfo.gov/content/pkg/GOVPUB-A57-PURL-gpo113056/pdf/GOVPUB-A57-PURL-gpo113056.pdf"},
    "F56M": {"titulo": "FAO-56, capítulo 10: efecto del acolchado orgánico en la evaporación", "url": "https://www.fao.org/4/X0490E/x0490e0g.htm"},
    "OSEI": {"titulo": "Osei et al. 2010, coberturas leguminosas contra Meloidogyne (J. Nematology)", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC3380490/"},
})
# Clases de infiltración USDA (tabla 3), en minutos por pulgada de agua
CLASES_INFIL = [(3, "muy rápida"), (10, "rápida"), (30, "moderadamente rápida"), (100, "moderada"), (300, "moderadamente lenta"), (1000, "lenta"), (40000, "muy lenta")]


def clase_infiltracion(minutos: float, lang="es") -> str:
    clases = zip((lim for lim, _ in CLASES_INFIL), CLASES_INFIL_EN) if lang == "en" else CLASES_INFIL
    return next((n for lim, n in clases if minutos < lim), _texto("impermeable", "impermeable", lang))
NIVEL = {"desnudo": 0, "baja": 1, "media": 2, "alta": 3}
NOMBRES = {"yuca": "Yuca", "caupi": "Frijol de bejuco", "camote": "Camote", "canavalia": "Canavalia", "maiz": "Maíz", "guandu": "Guandú",
           "mani_forrajero": "Maní forrajero", "frijol_comun": "Frijol", "zapallo": "Zapallo", "mucuna": "Mucuna"}
NOMBRES_EN = {"yuca": "Cassava", "caupi": "Cowpea", "camote": "Sweet potato", "canavalia": "Jack bean", "maiz": "Corn", "guandu": "Pigeon pea",
              "mani_forrajero": "Forage peanut (Arachis pintoi)", "frijol_comun": "Common bean", "zapallo": "Squash", "mucuna": "Velvet bean"}
CLASES_INFIL_EN = ["very rapid", "rapid", "moderately rapid", "moderate", "moderately slow", "slow", "very slow"]


VERSION_CALCULO = "2026-11-15a"  # se guarda en cada registro: dice con qué reglas salió la comparación


def _texto(es, en, lang):
    return en if lang == "en" else es


KC_LEGUMINOSA = {"ini": 0.4, "mid": 1.05, "end": 0.35}  # proxy caupí FAO-56; NO valor medido de otro cultivo


def _mm(s):  # 'AAAA-MM' -> índice de mes absoluto
    y, m = s.split("-")
    return int(y) * 12 + int(m) - 1


def _ocupa(cultivo, siembra_idx, corte_dias=None, lang="es"):
    """Meses que ocupa un cultivo y su cobertura por etapa: inicial desnudo, desarrollo baja, media = la del cultivo, final baja."""
    c = AGRO["cultivos"][cultivo]
    dias = corte_dias or (max(c["ciclo_dias"]) if c.get("ciclo_dias") else 120)
    base = max(c["ciclo_dias"]) if c.get("ciclo_dias") else 120
    et = c.get("etapas_dias") or [20, 40, max(1, base - 90), 30]
    k = dias / sum(et)
    lim = [et[0] * k, (et[0] + et[1]) * k, (et[0] + et[1] + et[2]) * k]
    kc = c["kc"] if c.get("kc") and all(c["kc"].get(k) is not None for k in ("ini", "mid", "end")) else KC_LEGUMINOSA
    out = {}
    for i in range(max(1, round(dias / 30.4))):
        d = i * 30.4 + 15
        etapa = 0 if d < lim[0] else 1 if d < lim[1] else 2 if d < lim[2] else 3
        cob = ["desnudo", "baja", c.get("cobertura") or "media", "baja"][etapa]
        kcm = [kc["ini"], (kc["ini"] + kc["mid"]) / 2, kc["mid"], (kc["mid"] + kc["end"]) / 2][etapa]
        out[siembra_idx + i] = {"cultivo": cultivo, "nombre": nombre_cultivo(cultivo, lang), "cobertura": cob, "kc": kcm}
    return out


def _cobertura_foto(pct):
    return "alta" if pct >= 60 else "media" if pct >= 30 else "baja" if pct >= 10 else "desnudo"


def _normalizar(texto):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', texto.strip().casefold())
                   if unicodedata.category(c) != 'Mn')


def buscar_cultivo(texto):
    """Identifica nombres exactos normalizados; no adivina especies por semejanza."""
    if not isinstance(texto, str):
        return None
    texto = _normalizar(texto)
    for clave, c in AGRO['cultivos'].items():
        if texto in {_normalizar(s) for s in [clave, c['nombre'], c['nombre_en'], *c['alias']]}:
            return clave
    return None


def nombre_cultivo(clave, lang='es'):
    c = AGRO['cultivos'][clave]
    return c['nombre_en'] if lang == 'en' else ('Frijol de bejuco' if clave == 'caupi' else c['nombre'].split(' / ')[0])



def _lista(items, lang='es'):
    items = list(dict.fromkeys(items))
    return (', '.join(items[:-1]) + _texto(' y ', ' and ', lang) + items[-1]) if len(items) > 1 else (items[0] if items else '')


def _fecha_mes(idx, lang='es'):
    meses = (['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
             if lang == 'en' else ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])
    return f"{meses[idx % 12]}{_texto(' de ', ' ', lang)}{idx // 12}"


def _mes_humedo(idx, temporada):
    return next((i for i in range(idx, idx + 12) if i % 12 + 1 in temporada['meses_humedos']), None)


def _textos_estrategia(id, cortos, arboles, leg, viva, siguientes, lang):
    t = lambda es, en: _texto(es, en, lang)
    nom = lambda c: nombre_cultivo(c, lang).lower()
    nombres = _lista([nom(c) for c in cortos], lang)
    # Artículo solo para una planta: evita tratar una lista mixta como un singular.
    articulos = {'yuca': 'la ', 'papa': 'la ', 'zanahoria': 'la ', 'cebolla': 'la ',
                 'lechuga': 'la ', 'berenjena': 'la ', 'sandia': 'la ', 'remolacha': 'la ',
                 'habichuela': 'la ', 'espinaca': 'la '}
    cosecha = (articulos.get(cortos[0], 'el ') + nombres if len(cortos) == 1 else nombres) if lang != 'en' else nombres
    hojas = t('tapar con hojas secas, paja o cascarilla de arroz', 'cover with dry leaves, straw or rice husks')
    sitio = t('los huecos', 'the gaps') if cortos else t('el suelo', 'the soil')
    if arboles:
        sitio += t(' y debajo de los árboles', ' and beneath the trees') if cortos else t(' debajo de los árboles', ' beneath the trees')
    if id == 'actual':
        practica = t(f'{nombres} tras {nombres}', f'{nombres} after {nombres}') if len(cortos) == 1 else t(f'{nombres} como siempre', f'{nombres} as usual')
        nombre = t(f'Lo que haces hoy: {practica}', f'What you do now: {practica}') if cortos else t('Lo que haces hoy: conservar las plantas que ya tienes', 'What you do now: keep your existing plants')
        razon = t(f'Se mantienen las siembras de {nombres}; al cosechar, los huecos quedan pelados hasta el siguiente ciclo.', f'Keep the planting dates for {nombres}; after harvest, gaps stay bare until the next cycle.') if cortos else t('Se mantienen los cultivos perennes, sin proponer cosechas ni rotaciones de ciclo corto.', 'Keep perennial crops, without proposing short-cycle harvests or rotations.')
        if arboles:
            razon += t(' Debajo de los árboles se supone suelo pelado salvo que la foto diga otra cosa.', ' Soil beneath the trees is assumed bare unless the photo shows otherwise.')
        beneficio = t('Sirve de referencia para comparar cambios sin alterar el manejo actual.', 'Provides a baseline for comparing changes to current management.')
    elif id == 'tapar':
        nombre = t(f'Tapar con hojas secas, paja o cascarilla {sitio}', f'Cover {sitio} with dry leaves, straw or rice husks')
        razon = t(f'Sin cambiar las siembras, {hojas} en {sitio} y entre las plantas.', f'Keep the planting schedule and {hojas} in {sitio} and between plants.')
        beneficio = t('Las hojas protegen el suelo y ayudan a conservar la humedad en los meses secos.', 'Leaves protect the soil and help retain moisture during dry months.')
    elif id == 'rotar':
        otros = _lista([nom(o) for _,_,o,s2 in siguientes if s2 is not None], lang)
        secuencia = nom(leg) + (t(f' y luego {otros}', f' and then {otros}') if otros else '')
        nombre = t(f'Rotar: {secuencia} después de {cosecha}', f'Rotate: {secuencia} after {cosecha}') if cortos else t('Conservar los perennes y tapar el suelo', 'Keep perennials and cover the soil')
        razon = t(f'Después de cosechar {cosecha}, esperar las lluvias para cambiar de familia. Mientras el terreno está libre, {hojas}.', f'After harvesting {cosecha}, wait for rain before changing crop families. While the ground is free, {hojas}.') if cortos else t(f'No hay cultivos de ciclo corto para rotar; se propone {hojas}, sin cambiar los perennes.', f'There are no short-cycle crops to rotate; {hojas}, keeping the perennials.')
        # Agrupa siembras iguales por cultivo y fecha aunque ocupen varias camas.
        eventos = sorted({(s,l) for l,s,_,_ in siguientes} | {(s2,o) for _,_,o,s2 in siguientes if s2 is not None})
        if eventos:
            razon += ' ' + t('Siembras sugeridas: ', 'Suggested plantings: ') + '; '.join(f'{nom(c)} ' + t('en ', 'in ') + _fecha_mes(s, lang) for s,c in eventos) + '.'
        if any(s2 is None for _,_,_,s2 in siguientes):
            razon += t(' La siguiente siembra queda fuera de estos doce meses; hasta entonces se deja el suelo tapado con hojas.', ' The following planting falls outside these twelve months; keep the soil covered with leaves until then.')
        beneficio = t('Alternar familias evita repetir siempre el mismo cultivo en la cama.', 'Alternating families avoids growing the same crop repeatedly in a bed.') if cortos else t('Se protege el suelo sin sacar los cultivos perennes.', 'Protect the soil without removing perennial crops.')
    else:
        nombre = t(f'{nom(viva).capitalize()} en el huerto', f'{nom(viva).capitalize()} in the garden') if cortos else t('Cobertura viva para el suelo', 'Living soil cover')
        if arboles:
            nombre = (nombre + t(' y maní forrajero bajo los árboles', ' and forage peanut beneath the trees')) if cortos else t('Maní forrajero bajo los árboles', 'Forage peanut beneath the trees')
        razon = t(f'Conservar la cosecha de {nombres} y sembrar {nom(viva)} en los huecos cuando llegue un mes húmedo. Cortar antes de la próxima siembra.', f'Keep the current {nombres} crop and sow {nom(viva)} in the gaps when a wet month arrives. Cut before the next planting.') if cortos else t('No hay camas de ciclo corto donde proponer abono verde.', 'There are no short-cycle beds for green manure.')
        if arboles:
            razon += t(' Probar maní forrajero bajo los árboles con las lluvias.', ' Try forage peanut beneath the trees when the rains arrive.')
        razon += ' ' + t('Mientras tanto, ', 'Meanwhile, ') + hojas + '.'
        beneficio = t('Las raíces vivas y las hojas ayudan a mantener el suelo protegido.', 'Living roots and leaves help keep the soil protected.')
    return nombre, razon, [beneficio]


def temporadas(normales):
    """Umbral P < ET0/2, inspirado en el periodo de crecimiento FAO.

    Conserva todas las transiciones (lluvias bimodales). Sin transición, inicio=None;
    si todos son húmedos se puede sembrar cualquier mes; si todos secos, ninguno.
    """
    lluvia = {n['mes']: n for n in normales}
    secos = sorted(m for m, n in lluvia.items() if n['lluvia'] < .5 * n['et0'])
    humedos = sorted(set(lluvia) - set(secos))
    inicios = [m for m in humedos if (m - 2) % 12 + 1 in secos]
    return {'meses_secos': secos, 'inicio_lluvias': inicios[0] if inicios else None,
            'inicios_lluvias': inicios, 'meses_humedos': humedos}


def _ventana(idx, temporada):
    """Próximo inicio de lluvias, incluido idx; sin seca, cualquier mes."""
    meses = temporada['inicios_lluvias'] or temporada['meses_humedos']
    return next((i for i in range(idx, idx + 12) if i % 12 + 1 in meses), None)


def _seleccion(exp):
    conocidos, desconocidos = [], []
    for texto in exp.get('cultivos', []):
        clave = buscar_cultivo(texto)
        destino, valor = (conocidos, clave) if clave else (desconocidos, str(texto))
        if valor not in destino:
            destino.append(valor)
    return conocidos, desconocidos


# Perennes de huerto no son árboles: no se introduce sotobosque bajo piña o caña.
ARBOLES = {'platano', 'banano', 'cacao', 'naranja', 'toronja', 'papaya', 'cafe',
           'mango', 'aguacate', 'coco', 'limon'}


def _generar(exp, normales, i0, lang):
    t = lambda es, en: _texto(es, en, lang)
    conocidos, desconocidos = _seleccion(exp)
    cortos = [c for c in conocidos if AGRO['cultivos'][c]['tipo'] != 'perenne']
    perennes = [c for c in conocidos if c not in cortos]
    arboles = [c for c in perennes if c in ARBOLES]
    temporada = temporadas(normales)
    siembras = {buscar_cultivo(k): v for k, v in exp.get('siembras', {}).items() if buscar_cultivo(k)}
    vacios = [t('Las fechas son orientativas: faltan variedad, heladas, temperatura mínima, área y calendario local. Confirma antes de sembrar.',
                'Dates are indicative: variety, frost, minimum temperature, area and local calendar are missing. Check before planting.'),
              t('El agua corresponde al promedio de camas de ciclo corto de igual superficie; no incluye árboles, perennes, riego ni ahorro por hojas. No es una dosis de riego.',
                'Water is the average of equal-area short-cycle beds; it excludes trees, perennials, irrigation and water savings from leaves. It is not an irrigation dose.'),
              t('Sin análisis de suelo no se conoce el nitrógeno disponible; la fijación publicada no equivale a fertilizante disponible.',
                'Without a soil test, available nitrogen is unknown; published fixation is not equivalent to available fertilizer.')]
    vacios += [t(f'{x}: cultivo sin datos; se conserva en plantas pero no entra en los cálculos.',
                 f'{x}: crop without data; retained in plants but excluded from calculations.') for x in desconocidos]
    if not conocidos:
        vacios.append(t('No hay cultivos reconocidos: los ceros no significan ausencia de necesidad de agua.',
                        'No crops were recognized: zeros do not mean there is no need for water.'))
    if perennes:
        vacios.append(t('Se conservan los perennes; la tira muestra las camas de ciclo corto y arboles muestra solo el suelo bajo las copas.',
                        'Perennials are retained; the strip shows short-cycle beds and arboles shows only the ground beneath canopies.'))
    if not temporada['meses_humedos']:
        vacios.append(t('No aparece una ventana de lluvias: no se propone una nueva siembra sin confirmar riego.',
                        'No rainy window was found: no new planting is proposed without confirmed irrigation.'))
    inicios = {}
    for c in cortos:
        try:
            valor = siembras[c]
            dt.datetime.strptime(valor, '%Y-%m')
            inicio = _mm(valor)
        except (KeyError, ValueError, TypeError):
            ventanas = [i for i in range(i0 - 11, i0 + 1)
                        if i % 12 + 1 in (temporada['inicios_lluvias'] or temporada['meses_humedos'])]
            inicio = ventanas[-1] if ventanas else i0
            fecha = _fecha_mes(inicio, lang)
            vacios.append(t(f'{nombre_cultivo(c, lang)}: sin fecha válida; se supone siembra en {fecha}.',
                            f'{nombre_cultivo(c, lang)}: no valid planting date; assumed planted in {fecha}.'))
        # Si el registro es antiguo, conserva el último ciclo anual que empezó antes de hoy.
        periodo = max(12, len(_ocupa(c, inicio)))
        if inicio < i0:
            inicio += ((i0 - inicio) // periodo) * periodo
        inicios[c] = inicio
    largo = any((_ventana(s + len(_ocupa(c, s)), temporada) or s) - (s + len(_ocupa(c, s))) >= 4
                for c, s in inicios.items())
    leg = ('frijol_comun' if (exp.get('elevacion_m') or 0) > 1500 else
           'caupi' if len(temporada['meses_secos']) >= 4 else 'canavalia' if largo or exp.get('charcos') == 'si' or (exp.get('infiltracion_min') or 0) >= 100 else 'caupi')
    viva = 'guandu' if arboles else ('canavalia' if len(temporada['meses_secos']) >= 4 else 'mucuna')
    estrategias = []
    for id in ('actual', 'tapar', 'rotar', 'viva'):
        camas, pasos = [], []
        siguientes = []
        for c, inicio in inicios.items():
            cama = _ocupa(c, inicio, lang=lang)
            pasos.append({'cultivo': c, 'siembra': inicio, 'existente': True})
            fin = max(cama) + 1
            periodo = max(12, len(cama))
            if id == 'rotar':
                s = _ventana(fin, temporada)
                if s is not None and s < i0 + 12:
                    cultivo = _ocupa(leg, s, 80 if leg == 'canavalia' else None, lang)
                    cama.update(cultivo); pasos.append({'cultivo': leg, 'siembra': s})
                    # Otra familia tanto respecto a la leguminosa como al cultivo anterior.
                    otro = next(x for x in cortos + ['camote', 'maiz', 'zapallo']
                                if AGRO['cultivos'][x]['familia'] not in {AGRO['cultivos'][c]['familia'], 'Fabaceae'})
                    s2 = _mes_humedo(max(cultivo) + 1, temporada)
                    if s2 is not None and s2 < i0 + 12:
                        cama.update(_ocupa(otro, s2, lang=lang))
                        pasos.append({'cultivo': otro, 'siembra': s2})
                    else:
                        s2 = None
                    siguientes.append((leg, s, otro, s2))
            else:
                if id != "viva":
                    for s in range(inicio + periodo, i0 + 12, periodo):
                        cama.update(_ocupa(c, s, lang=lang))
                if id == 'viva':
                    # En cada hueco libre: no arranca la comida ni pisa la próxima siembra.
                    for s in range(max(i0, fin), i0 + 12):
                        if s not in cama and s % 12 + 1 in temporada['meses_humedos']:
                            libre = next((k for k in range(s, i0 + 12) if k in cama), i0 + 12)
                            corte = min(80, (libre - s) * 30.4) if viva != 'guandu' else (libre - s) * 30.4
                            for k, v in _ocupa(viva, s, corte, lang).items():
                                if k < libre:
                                    cama[k] = v
                            pasos.append({'cultivo': viva, 'siembra': s})
            camas.append(cama)
        vac = list(vacios)
        usados = list(dict.fromkeys(conocidos + [p['cultivo'] for p in pasos] + (['mani_forrajero'] if arboles and id == 'viva' else [])))
        for c in usados:
            datos = AGRO['cultivos'][c]
            faltas = []
            if not datos.get('kc') or any(datos['kc'].get(k) is None for k in ('ini', 'mid', 'end')):
                faltas.append(t('Kc aproximado de referencia (0.4, 1.05, 0.35)', 'reference proxy Kc (0.4, 1.05, 0.35)'))
            if not datos.get('etapas_dias'):
                faltas.append(t('etapas supuestas: 20/40/(ciclo−90)/30 días', 'assumed stages: 20/40/(cycle−90)/30 days'))
            if not datos.get('ciclo_dias') and c not in perennes:
                faltas.append(t('ciclo supuesto de 120 días', 'assumed 120-day cycle'))
            if faltas and c not in perennes:
                vac.append(f'{nombre_cultivo(c, lang)}: ' + '; '.join(faltas) + '.')
        nombre, razon, beneficios = _textos_estrategia(id, cortos, arboles, leg, viva, siguientes, lang)
        riesgos = [t('Revisa las plagas compartidas, el drenaje y la adaptación local antes de cambiar de cultivo.',
                     'Check shared pests, drainage and local adaptation before changing crops.')]
        if id != 'actual':
            riesgos.append(t('Usa hojas sanas; no traslades tierra ni hojas de plantas enfermas.', 'Use healthy leaves; do not move soil or leaves from sick plants.'))
        if 'canavalia' in usados or 'mucuna' in usados:
            riesgos.append(t('Canavalia y mucuna se proponen como abono verde, no como frijoles para cocinar.', 'Jack bean and velvet bean are proposed as green manure, not as cooking beans.'))
        if id == 'viva':
            riesgos.append(t('La cobertura viva compite por agua y luz; prueba primero un pedazo pequeño.', 'Living cover competes for water and light; try a small patch first.'))
        estrategias.append({'id':id, 'nombre':nombre, 'razon':razon, 'cama':pasos, '_camas':camas,
            '_plantas':usados, '_desconocidos':desconocidos, '_tiene_arboles':bool(arboles),
            'huecos':'desnudo' if id=='actual' else 'acolchado',
            'arboles':'desnudo' if id=='actual' else 'mani_forrajero' if id=='viva' and arboles else 'acolchado',
            'beneficios': beneficios,
            'vacios':vac, 'riesgos':riesgos,
            'evidencia':list(dict.fromkeys(['SC','F56'] + [f for c in usados for f in AGRO['cultivos'][c]['fuentes']]))})
    return estrategias


def _mezclar(camas, idx, hojas, lang):
    """Igual área por cama; Kc medio, cobertura mínima conservadora; no se suman mm.

    cultivo mantiene una clave válida representativa; nombre enumera todas las camas.
    plantas conserva la lista completa. Sin camas no se inventa una plantación.
    """
    vacio = {'cultivo':None, 'nombre':_texto('hojas secas', 'dry leaves', lang) if hojas else None,
             'cobertura':'baja' if hojas else 'desnudo', 'kc':0}
    filas = [dict(c.get(idx, vacio)) for c in camas] or [vacio]
    if hojas:
        for f in filas:
            if NIVEL[f['cobertura']] < 1:
                f['cobertura'] = 'baja'
    return {'cultivo':next((f['cultivo'] for f in filas if f['cultivo']), None),
            'nombre':', '.join(dict.fromkeys(f['nombre'] for f in filas if f['nombre'])) or None,
            'kc':mean(f['kc'] for f in filas), 'cobertura':min((f['cobertura'] for f in filas), key=NIVEL.get)}


def comparar(exp: dict, normales: list[dict], ninos_prom: list[dict], hoy: dt.date | None = None, lang="es") -> dict:
    t = lambda es, en: _texto(es, en, lang)
    hoy = hoy or dt.date.today()
    i0 = hoy.year * 12 + hoy.month - 1
    horizonte = range(i0, i0 + 12)
    pct_nino = {p["mes"]: (p["pct_normal"] if p["pct_normal"] is not None else 100) / 100 for p in ninos_prom}
    fotos = {f["tipo"]: f for f in exp.get("fotos", [])}
    infil = exp.get("infiltracion_min")
    temporada = temporadas(normales)
    normal_por_mes = {n["mes"]: n for n in normales}
    prior = exp.get("prioridades") or []
    res = []
    for e in _generar(exp, normales, i0, lang):
        ajustes = []
        tira, arboles = [], []
        for idx in horizonte:
            mes = idx % 12 + 1
            m = _mezclar(e['_camas'], idx, e['huecos'] == 'acolchado', lang)
            m = {**m, "mes": mes}
            if idx == i0 and "cama" in fotos:  # el dato de campo manda sobre el supuesto en el mes de la foto
                m["cobertura"] = _cobertura_foto(fotos["cama"]["cobertura"])
                m["medido"] = True
            tira.append(m)
            a = {"mes": mes, "cultivo": None}
            if e["arboles"] == "mani_forrajero":
                siembra = _ventana(i0, temporada)
                siembra = siembra if siembra is not None else i0 + 24  # sin lluvias no se establece
                a.update(nombre=t("hojas secas", "dry leaves") if idx < siembra else t("maní forrajero", "forage peanut (Arachis pintoi)"), cobertura="alta" if idx >= siembra + 3 else "baja")
            elif e["arboles"] == "acolchado":
                a.update(nombre=t("hojas secas", "dry leaves"), cobertura="baja")
            else:
                a.update(nombre=None, cobertura="desnudo")
            if e["_tiene_arboles"]:
                arboles.append(a)
        # la foto debajo de los árboles corrige el supuesto de la estrategia actual
        if e["id"] == "actual" and e["_tiene_arboles"] and "perennes" in fotos:
            pct = fotos["perennes"]["cobertura"]
            hoj = fotos["perennes"].get("hojarasca")
            cob = _cobertura_foto(pct)
            if hoj == "mucha" and NIVEL[cob] < 2:
                cob = "media"
            elif hoj == "poca" and NIVEL[cob] < 1:
                cob = "baja"
            if cob != "desnudo":
                for k, a in enumerate(arboles):  # se mide este mes; los demás se suponen iguales hasta la próxima foto
                    a.update(nombre=t("hojarasca", "leaf litter") if hoj in ("mucha", "poca") else t("plantas", "plants"), cobertura=cob, medido=k == 0)
                ajustes.append(t(f"Tu foto debajo de los árboles midió {pct}% de planta verde"
                               + (f" y dijiste que hay {hoj} hojarasca" if hoj else "")
                               + ". Ya no se cuenta como suelo desnudo.",
                               f"Your photo under the trees measured {pct}% green plant cover"
                               + (f" and you reported { {'mucha': 'plenty of', 'poca': 'a little', 'nada': 'no'}.get(hoj, hoj)} leaf litter" if hoj else "")
                               + ". It is no longer counted as bare soil."))
            else:
                ajustes.append(t(f"Tu foto confirma el suelo desnudo debajo de los árboles ({pct}% de planta verde). El satélite no lo puede ver porque mira la copa.", f"Your photo confirms bare soil under the trees ({pct}% green plant cover). The satellite cannot see it because it sees the tree canopy."))
        # agua: lo que pide el cultivo de la cama contra la lluvia efectiva, en año normal y en uno como los Niños
        seca = [m for m in tira if m["mes"] in temporada["meses_secos"]]

        def deficit(factor):  # seca derivada de las normales locales
            tot = 0
            for m in seca:
                n = normal_por_mes[m["mes"]]
                p = n["lluvia"] * (factor.get(m["mes"], 1) if factor else 1)
                tot += max(0, m["kc"] * n["et0"] - lluvia_efectiva(p))
            return round(tot)
        presentes = list(dict.fromkeys(v['cultivo'] for cama in e['_camas'] for idx, v in cama.items() if idx in horizonte))
        if e['_tiene_arboles'] and e['arboles'] == 'mani_forrajero' and _ventana(i0, temporada) is not None:
            presentes.append('mani_forrajero')
        n_fij = [AGRO['cultivos'][c]['fija_n_kg_ha'] for c in presentes if AGRO['cultivos'][c].get('fija_n_kg_ha')]
        familias = {AGRO['cultivos'][c]['familia'] for c in presentes}
        desn_cama = sum(m["cobertura"] == "desnudo" for m in tira)
        desn_arb = sum(a["cobertura"] == "desnudo" for a in arboles)
        riesgos = list(e["riesgos"])
        # la lata manda; si no hay lata, la pregunta de los charcos dice al menos si el agua se queda arriba
        lento = (infil is not None and infil >= 100) or exp.get("charcos") == "si"
        if lento:
            dato = (t(f"El agua tardó {infil:g} minutos en entrar en tu lata (infiltración {clase_infiltracion(infil)})", f"The water took {infil:g} minutes to soak into the soil in your can ({clase_infiltracion(infil, lang)} infiltration)") if infil is not None
                    else t("Dices que después de un aguacero quedan charcos", "You report puddles after heavy rain"))
            riesgos.append(t(f"{dato}: el agua se queda arriba. Los cultivos sensibles al encharcamiento pueden sufrir; revisa el drenaje y considera camas elevadas.", f"{dato}: water stays on the surface. Crops sensitive to waterlogging may suffer; check drainage and consider raised beds."))
            if e["id"] == "viva":
                ajustes.append(t(f"{dato}. La cobertura viva puede ayudar a mejorar la estructura del suelo; no sustituye corregir el drenaje.", f"{dato}. Living cover may help improve soil structure; it does not replace fixing drainage."))
        elif infil is not None and infil < 10 and e["huecos"] == "acolchado":
            ajustes.append(t(f"El agua entró {clase_infiltracion(infil)} en tu lata ({infil:g} minutos): drena bien pero guarda poca humedad. "
                           "Tapar el suelo ayuda en los meses secos: por cada 10 % de suelo tapado con hojas se seca ~5 % menos (FAO-56).",
                           f"Water soaked into the soil in your can at a {clase_infiltracion(infil, lang)} rate ({infil:g} minutes). It drains well but holds little moisture. "
                           "Covering the soil helps during dry months. For every 10% covered with leaves, soil evaporation drops by about 5% (FAO-56)."))
        evid = e["evidencia"] + (["USDA"] if infil is not None else []) + (["F56M"] if e["huecos"] == "acolchado" else [])
        res.append({
            "id": e["id"], "nombre": e["nombre"], "aplica_a": t("huerto y árboles", "garden plot and trees") if e["_tiene_arboles"] else t("huerto", "garden plot"),
            "tira": tira, "arboles": arboles, "meses_desnudo": desn_cama + desn_arb,
            "desnudo_cama": desn_cama, "desnudo_arboles": desn_arb,
            "n_kg_ha": [sum(x[0] for x in n_fij), sum(x[1] for x in n_fij)] if n_fij else None,  # ponytail: solo para ordenar; la pantalla usa n_por_planta
            "n_por_planta": [{"nombre": nombre_cultivo(c, lang), "kg_ha": AGRO["cultivos"][c]["fija_n_kg_ha"]}
                             for c in presentes
                             if AGRO["cultivos"][c].get("fija_n_kg_ha")],
            "familias": len(familias),
            "agua": {"demanda_seca_mm": round(sum(m["kc"] * normal_por_mes[m["mes"]]["et0"] for m in seca)),
                     "deficit_normal_mm": deficit(None), "deficit_nino_mm": deficit(pct_nino)},
            # nombre científico al lado: en otro país la misma planta se llama distinto
            "plantas": [{"nombre": nombre_cultivo(c, lang), "cientifico": AGRO["cultivos"][c]["cientifico"]}
                        for c in e["_plantas"]] + [{"nombre": c, "cientifico": None} for c in e["_desconocidos"]],
            "razon": e["razon"], "beneficios": e["beneficios"], "vacios": e["vacios"]
                      + ([t("Se supone que lo que muestra tu foto de hoy debajo de los árboles se mantiene todo el año.", "We assume what today's photo under the trees shows stays the same all year.")]
                         if e["id"] == "actual" and e["_tiene_arboles"] and "perennes" in fotos else []),
            "riesgos": riesgos, "ajustes": [a for a in ajustes if a],
            "evidencia": [{"id": k, "titulo": AGRO["fuentes"][k]["titulo"], "url": AGRO["fuentes"][k]["url"]} for k in dict.fromkeys(evid) if k in AGRO["fuentes"]],
        })
    return {"version": VERSION_CALCULO, "estrategias": res, "faltan": faltan(exp, lang), "lectura": lectura(res, prior, lang, (infil is not None and infil >= 100) or exp.get("charcos") == "si")}


def lectura(res, prior, lang="es", lento=False):
    """Qué estrategia sale mejor según lo que le importa al productor. Se admite empate."""
    t = lambda es, en: _texto(es, en, lang)
    agua = {(r['agua']['deficit_normal_mm'], r['agua']['deficit_nino_mm']) for r in res}
    nota_agua = []
    if agua == {(0, 0)}:
        if all(r['agua']['demanda_seca_mm'] == 0 for r in res):
            nota_agua = [t('El huerto no tiene cultivo en los meses secos del calendario calculado, así que no hace falta riego para esas camas en ese periodo. Esto no incluye los árboles ni los cultivos sin datos.',
                           'The garden has no crop during the dry months in the calculated calendar, so those beds need no irrigation in that period. This excludes trees and crops without data.')]
        else:
            nota_agua = [t('La lluvia efectiva cubre la demanda calculada del huerto en los meses secos; no se estima déficit de agua.',
                           'Effective rainfall covers the calculated garden demand during dry months; no water deficit is estimated.')]
    elif len(agua) == 1:
        normal, nino = next(iter(agua))
        nota_agua = [t(f'En agua salen iguales este año: durante los meses secos se estima un déficit de {normal} mm con lluvia normal y {nino} mm con lluvia como la de los Niños anteriores.',
                       f'All options have the same estimated water deficit this year: {normal} mm during dry months with normal rainfall and {nino} mm with rainfall like past El Niño events.')]
    if lento:
        viva = next(r for r in res if r['id'] == 'viva')
        nota_agua.append(t(f"Para los charcos o la infiltración lenta, {viva['nombre']} es la opción que más puede ayudar a la estructura con raíces y suelo protegido. Revisa también el drenaje; no se calculó una mejora de infiltración.",
                           f"For puddles or slow infiltration, {viva['nombre']} may help soil structure the most through roots and protected soil. Also check drainage; no infiltration improvement was calculated."))
    if not prior:
        return [t("Escoge qué te importa más (paso 5) y te digo cuál sale mejor para ti.", "Choose what matters most to you (step 5) to see which option fits you best.")] + nota_agua
    crit = {"suelo": lambda r: (r["meses_desnudo"], -(r["n_kg_ha"] or [0, 0])[0], -r["familias"]),
            "agua": lambda r: (r["agua"]["deficit_nino_mm"],),
            "trabajo": lambda r: (len([1 for a, b in zip(r["tira"], r["tira"][1:]) if a.get("cultivo") != b.get("cultivo") and b.get("cultivo")]),),
            "comida": lambda r: (-len({m["cultivo"] for m in r["tira"] if m["cultivo"]}),),
            "venta": lambda r: (0,)}
    puntos = {r["id"]: 0 for r in res}
    for p in prior:
        if p in crit:
            for r in res:  # puesto = cuántas salen estrictamente mejor; los empates comparten puesto
                puntos[r["id"]] += sum(crit[p](o) < crit[p](r) for o in res)
    mejor = min(puntos.values())
    ganadoras = [r["nombre"] for r in res if puntos[r["id"]] == mejor]
    if len(ganadoras) > 1:
        return [t(f"Con lo que escogiste quedan empatadas: {' y '.join(ganadoras)}. Toca cada una para ver en qué se diferencian.", f"Based on your choices, these options tie: {' and '.join(ganadoras)}. Tap each one to see how they differ.")] + nota_agua
    return [t(f"Con lo que escogiste, la que mejor sale es: {ganadoras[0]}.", f"Based on your choices, the best option is: {ganadoras[0]}.")] + nota_agua


def faltan(exp, lang="es"):
    t = lambda es, en: _texto(es, en, lang)
    f = {x["tipo"] for x in exp.get("fotos", [])}
    out = []
    if any(c in ARBOLES for c in _seleccion(exp)[0]) and "perennes" not in f:
        out.append({"clave": "foto_perennes", "texto": t("Foto del suelo debajo de los árboles", "Photo of the soil under the trees"),
                    "cambia": t("El satélite ve la copa verde de los árboles, no el suelo de abajo. Tu foto dice si ahí hay suelo desnudo.", "The satellite sees the green tree canopy, not the soil underneath. Your photo shows whether that soil is bare.")})
    if "cama" not in f:
        out.append({"clave": "foto_cama", "texto": t("Foto del suelo del huerto", "Photo of the soil in the garden plot"), "cambia": t("Mide cuánto suelo está tapado este mes.", "Shows how much soil is covered this month.")})
    if exp.get("infiltracion_min") is None and not exp.get("charcos"):
        out.append({"clave": "infiltracion", "texto": t("Si quedan charcos después de un aguacero", "Whether puddles remain after heavy rain"), "cambia": t("Dice si el agua entra o se queda arriba; eso decide entre raíz honda y tapar con hojas.", "Shows whether water soaks in or stays on top. This helps choose between deep roots and covering the soil with leaves.")})
    if any(AGRO["cultivos"][c]["tipo"] != "perenne" and c not in {buscar_cultivo(k) for k in exp.get("siembras", {})} for c in _seleccion(exp)[0]):
        out.append({"clave": "parcela", "texto": t("Cuándo sembraste tus cultivos", "When you planted your crops"), "cambia": t("Mueve el mes en que el huerto queda libre para lo siguiente.", "Changes the month when the garden plot becomes free for the next crop.")})
    if not exp.get("prioridades"):
        out.append({"clave": "prioridades", "texto": t("Qué te importa más", "What matters most to you"), "cambia": t("Ordena las estrategias según lo tuyo.", "Ranks the options by what matters to you.")})
    return out


if __name__ == "__main__":
    assert round(lluvia_efectiva(100)) == 84 and round(lluvia_efectiva(300)) == 155
    print("ok")


def resumen_appeears(ae: dict) -> dict:
    """Lo que AppEEARS devolvió para el punto, ya resumido: NDVI de 30 m reciente, humedad de raíz SMAP por mes contra su
    promedio 2015-hoy, estrés ECOSTRESS y elevación."""
    s = ae.get("series", {})
    hls = sorted([x for k in ("HLSL30_VI.020", "HLSS30_VI.020") for x in s.get(k, []) if -1 <= x["valor"] <= 1], key=lambda x: x["fecha"])
    smap = s.get("SPL4SMGP.008", [])
    por_mes, actual = {}, {}
    for x in smap:
        if x["valor"] < 0:
            continue
        por_mes.setdefault(int(x["fecha"][5:7]), []).append(x["valor"])
    ult = smap[-1]["fecha"][:7] if smap else None
    rec = [x["valor"] for x in smap if ult and x["fecha"].startswith(ult) and x["valor"] >= 0]
    m = int(ult[5:7]) if ult else None
    esi = [x for x in s.get("ECO_L4T_ESI.002", []) if 0 <= x["valor"] <= 2]
    dem = s.get("NASADEM_NC.001", [])
    return {
        "hls_ndvi": hls[-24:], "hls_n": len(hls),
        "smap": {"mes": ult, "actual": round(mean(rec), 3) if rec else None,
                 "promedio_mes": round(mean(por_mes[m]), 3) if m in por_mes else None,
                 "meses": [{"mes": k, "media": round(mean(v), 3)} for k, v in sorted(por_mes.items())]},
        "ecostress_esi": esi[-12:], "elevacion_m": dem[0]["valor"] if dem else None, "tarea": ae.get("tarea"), "consultado": ae.get("consultado"),
    }
