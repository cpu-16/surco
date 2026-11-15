"""Pruebas sin red: uv run python test_general.py. Caché POWER en modo solo lectura."""
import datetime as dt
import json
import re
import sqlite3
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
import app
import motor
import nasa

HOY = dt.date(2026, 11, 14)
SANTIAGO = {'lat':8.1, 'lon':-80.98, 'cultivos':['yuca','pina','platano','cacao','naranja','toronja']}


def power_cache():
    def get(url, params, *args, **kwargs):
        full = str(httpx.URL(url, params=params))
        with sqlite3.connect(f'file:{nasa.DB}?mode=ro', uri=True) as c:
            row = c.execute('select cuerpo, consultado from cache where url=?', (full,)).fetchone()
        assert row, f'Falta fixture POWER en cache: {full}'
        return json.loads(row[0]), full, row[1]
    with patch.object(nasa, '_get', side_effect=get), patch.object(httpx, 'get', side_effect=AssertionError('Red prohibida')):
        return nasa.power(8.10, -80.98, hasta=HOY)


def normales(humedos):
    return [{'mes':m, 'lluvia':150 if m in humedos else 10, 'et0':100, 'tmax':28, 'humedad_raiz':.5} for m in range(1,13)]


def numerico(x):
    """Misma estructura completa; todos los valores numéricos, bool y null coinciden."""
    if isinstance(x, dict): return {k:numerico(v) for k,v in x.items()}
    if isinstance(x, list): return [numerico(v) for v in x]
    if isinstance(x, str): return '<texto>'
    return x


def fuentes_nuevas():
    import tempfile
    import time
    import earthdata
    import pronostico
    from pathlib import Path
    power = power_cache()
    with tempfile.TemporaryDirectory() as carpeta, patch.object(nasa, 'DB', Path(carpeta) / 'cache.sqlite'):
        fechas = [(dt.date.today() + dt.timedelta(days=i)).isoformat() for i in range(7)]
        datos = {'daily': {'time': fechas, 'precipitation_sum': [0, .94, 1, 2.26, 3, 4, 5],
                           'precipitation_probability_max': [None, 10, 20, 30, 40, 50, 60]}}
        response = httpx.Response(200, json=datos, request=httpx.Request('GET', 'https://example.test'))
        with patch.object(httpx, 'get', return_value=response) as get:
            pr = pronostico.lluvia(8.1, -80.98)
            assert pr['total_7d'] == 16 and pr['dias_con_lluvia'] == 5
            assert pr['dias'][3]['lluvia'] == 2.3 and pr['dias'][0]['prob'] is None
            assert len(pr['dias']) == 7 and pr['meta']['unidades'] == 'mm/día'
            assert pronostico.lluvia(8.1, -80.98) == pr and get.call_count == 1
            params = dict(httpx.URL(get.call_args.args[0]).params)
            assert set(params) == {'latitude', 'longitude', 'daily', 'timezone', 'forecast_days'}
            assert params['latitude'] == '8.1' and params['longitude'] == '-80.98'
            assert get.call_args.kwargs['timeout'] == 10
        with nasa._db() as c:
            c.execute('update cache set consultado=?', (time.time() - 10801,))
        with patch.object(httpx, 'get', side_effect=httpx.ReadTimeout('simulado')):
            assert pronostico.lluvia(8.1, -80.98) is None
        with patch.object(httpx, 'get', return_value=httpx.Response(200, json={'daily': {}}, request=response.request)):
            assert pronostico.lluvia(8.1, -80.98) is None
        with patch.object(app, '_en_fondo', return_value=None), patch.object(nasa, 'power', return_value=power), patch.object(earthdata, 'hay_cuenta', return_value=False), patch.object(app, '_trabajos', {}):
            lugar = app.lugar(8.1, -80.98)
            assert lugar['pronostico'] is None and 'pronostico' in lugar['pendiente']
        with nasa._db() as c:
            c.execute('create table tareas(clave text primary key, id text, estado text, cuerpo text, t real)')
            c.execute('insert into tareas values (?,?,?,?,?)', ('appeears:8.1,-80.98,2015-01-01', 'viejo', 'processing', None, 0))
        post_response = httpx.Response(200, json={'task_id': 'nuevo'}, request=response.request)
        with patch.object(earthdata, '_ae_cabecera', return_value={}), patch.object(httpx, 'post', return_value=post_response) as post:
            assert earthdata.appeears(8.1, -80.98) is None
            params = post.call_args.kwargs['json']['params']
            assert params['layers'] == [{'product': 'HLSL30_VI.020', 'layer': 'NDVI'}, {'product': 'HLSS30_VI.020', 'layer': 'NDVI'}]
            assert params['dates'] == [{'startDate': (dt.date.today() - dt.timedelta(days=180)).strftime('%m-%d-%Y'), 'endDate': dt.date.today().strftime('%m-%d-%Y')}]
            viejo = {'tarea': 'anterior', 'series': {'HLSL30_VI.020': [{'fecha': fechas[0], 'valor': .5}]}}
            with nasa._db() as c:
                c.execute("update tareas set estado='done', cuerpo=?, t=? where clave like 'hls:%'", (json.dumps(viejo), time.time() - 8 * 86400))
            assert earthdata.appeears(8.1, -80.98) == viejo and post.call_count == 2
            with patch.object(httpx, 'get', return_value=httpx.Response(200, json={'status': 'processing'}, request=response.request)):
                assert earthdata.appeears(8.1, -80.98) == viejo and post.call_count == 2
            responses = [httpx.Response(200, json={'status': 'done'}, request=response.request),
                         httpx.Response(200, json={'files': [{'file_name': 'point-results.csv', 'file_id': 'csv'}]}, request=response.request),
                         httpx.Response(200, text='Date,HLSL30_VI_020_NDVI\n2026-11-14,0.6\n', request=response.request)]
            with patch.object(httpx, 'get', side_effect=responses):
                nuevo = earthdata.appeears(8.1, -80.98)
            assert nuevo['series']['HLSL30_VI.020'][0]['valor'] == .6
            assert earthdata.appeears(8.1, -80.98) == nuevo and post.call_count == 2
            with nasa._db() as c:
                assert c.execute("select estado from tareas where id='viejo'").fetchone()[0] == 'processing'
            resumen = motor.resumen_appeears(nuevo)
            assert resumen['hls_n'] == 1 and resumen['smap']['actual'] is None
            assert resumen['smap']['meses'] == [] and resumen['ecostress_esi'] == [] and resumen['elevacion_m'] is None
    for lat, lon in ((14.8, -89.54), (-1.52, 37.26), (17.4, 78.5)):
        exp = {**SANTIAGO, 'lat': lat, 'lon': lon, 'siembras': {'yuca': '2026-06'}}
        es = motor.comparar(exp, normales({4,5,6,7,8,9,10,11}), [], HOY)
        texto = ' '.join(e['nombre'] + ' ' + e['razon'] + ' ' + ' '.join(x.get('nombre') or '' for campo in ('tira', 'arboles', 'plantas') for x in e[campo]) for e in es['estrategias']).lower()
        assert 'frijol de bejuco' not in texto and 'guandú' not in texto and 'camote' not in texto
        assert 'gandul' in texto and 'caupí' in texto
        en = json.dumps(motor.comparar(exp, normales({4,5,6,7,8,9,10,11}), [], HOY, lang='en')).lower()
        assert 'cowpea' in en and 'pigeon pea' in en
    print('OK: pronóstico y caché, HLS liviano y renovación, nombres regionales y detalle.')


def main():
    fuentes_nuevas()
    p = power_cache(); n = motor.clima_mensual(p['dias'])
    temp = motor.temporadas(n)
    print('Santiago POWER:', temp)
    # Aproximación a dic–abr: los bordes NO cruzan el umbral pedido en esta celda.
    assert set(temp['meses_secos']) == {1,2,3}, temp
    assert all(m in {12,1,2,3,4} for m in temp['meses_secos'])
    assert temp['inicio_lluvias'] == 4
    ni = motor.ninos(p['dias'], n)['promedio']
    kenya = normales({3,4,5,10,11,12})
    assert motor.temporadas(kenya)['inicios_lluvias'] == [3,10]
    india = normales({6,7,8,9,10})
    casos = [(SANTIAGO,n),
             ({'lat':-1.52,'lon':37.26,'cultivos':['maíz','frijol común'], 'siembras':{'maíz':'2026-10','frijol común':'2026-10'}},kenya),
             ({'lat':17.4,'lon':78.5,'cultivos':['tomate','ñajú','mango']},india),
             ({'cultivos':['xyz']},n), ({'cultivos':[]},n),
             ({'cultivos':['coco']},n), ({'cultivos':['papa'],'elevacion_m':2000},n)]
    campos = {'id','nombre','aplica_a','tira','arboles','meses_desnudo','desnudo_cama','desnudo_arboles','n_kg_ha','n_por_planta','familias','agua','plantas','razon','beneficios','vacios','riesgos','ajustes','evidencia','comida_meses','labores'}
    for exp, clima in casos:
        es = motor.comparar(exp,clima,ni,HOY)
        en = motor.comparar(exp,clima,ni,HOY,lang='en')
        assert numerico(es) == numerico(en)
        assert es['version'] == '2026-11-15b'
        assert [e['id'] for e in es['estrategias']] == ['actual','tapar','rotar','viva']
        for e in es['estrategias']:
            assert set(e) == campos | ({'detalle'} if e['id'] == 'actual' else set())
            assert len(e['tira']) == (12 if any(motor.AGRO['cultivos'][c]['tipo'] != 'perenne' for c in motor._seleccion(exp)[0]) else 0)
            assert all(set(m) >= {'mes','cultivo','nombre','cobertura','kc'} for m in e['tira'])
            assert all(x['cientifico'] for x in e['plantas'] if x['nombre'] != 'xyz')
        if exp.get('lon') == 37.26:
            assert all(not e['arboles'] and e['desnudo_arboles'] == 0 for e in es['estrategias'])
            assert 'bajo los árboles' not in json.dumps(es,ensure_ascii=False)
            assert any('Maíz' in m['nombre'] and 'Frijol' in m['nombre'] for m in es['estrategias'][0]['tira'] if m['nombre'])
        if exp.get('lon') == 78.5:
            assert all(len(e['arboles']) == 12 for e in es['estrategias'])
            assert {p['cientifico'] for p in es['estrategias'][0]['plantas']} == {'Solanum lycopersicum','Abelmoschus esculentus','Mangifera indica'}
        if exp.get('cultivos') == ['xyz']:
            assert all(any('xyz' in v and 'no entra' in v for v in e['vacios']) for e in es['estrategias'])
            assert all(e['plantas'] == [{'nombre':'xyz','cientifico':None}] for e in es['estrategias'])
            assert all(e['agua']['demanda_seca_mm'] is None for e in es['estrategias'])
        if exp.get('elevacion_m'):
            assert 'frijol común' in es['estrategias'][2]['nombre']
    assert motor.buscar_cultivo(' AHUYAMA ') == 'zapallo'
    assert motor.buscar_cultivo('black-eyed pea') == 'caupi'
    assert motor.buscar_cultivo('MAÍZ') == 'maiz'
    assert motor.buscar_cultivo('xyz') is None
    # Una segunda cama sí cambia el promedio de Kc: no se pierde por solaparse.
    mix = motor.comparar(casos[1][0],kenya,[],HOY)['estrategias'][0]
    a = motor.comparar({'cultivos':['maiz'],'siembras':{'maiz':'2026-10'}},kenya,[],HOY)['estrategias'][0]
    b = motor.comparar({'cultivos':['frijol_comun'],'siembras':{'frijol_comun':'2026-10'}},kenya,[],HOY)['estrategias'][0]
    assert all(abs(m['kc'] - (x['kc']+y['kc'])/2) < 1e-9 for m,x,y in zip(mix['tira'],a['tira'],b['tira']))
    # Fotos y charcos conservan su efecto, incluso con infiltración rápida declarada.
    foto = {**SANTIAGO,'charcos':'si','infiltracion_min':2,'fotos':[{'tipo':'perennes','fecha':'2026-11-14','cobertura':5,'hojarasca':'mucha'},{'tipo':'cama','fecha':'2026-11-14','cobertura':45}]}
    r = motor.comparar(foto,n,ni,HOY)
    assert r['estrategias'][0]['desnudo_arboles'] == 0  # mucha hojarasca bajo los árboles: el resto del año, poco tapado
    poca = {**foto, 'fotos': [{'tipo':'perennes','fecha':'2026-11-14','cobertura':5,'hojarasca':'poca'}]}
    assert motor.comparar(poca,n,ni,HOY)['estrategias'][0]['desnudo_arboles'] == 11  # poca: solo el mes de la foto
    assert r['estrategias'][0]['arboles'][0]['medido']
    assert all(e['tira'][0]['medido'] and e['tira'][0]['cobertura'] == 'media' for e in r['estrategias'])
    assert any(r['estrategias'][3]['nombre'] in x for x in r['lectura'])
    # Límites: lluvias todo el año, ninguna lluvia, valores nulos, fechas inválidas y futuras.
    for humedos in (set(),set(range(1,13))):
        r = motor.comparar({'cultivos':['ñajú','cebollina','ajo'], 'siembras':{'ñajú':'mal','ajo':'2030-02'}},normales(humedos),[],HOY)
        assert all(len(e['tira']) == 12 for e in r['estrategias'])
    # Rotación: dos lluvias, altitud y suelos; calendarios más allá de fechas fijas.
    for exp, clima, leg in [
        ({'cultivos':['maiz'],'elevacion_m':1600}, kenya, 'frijol_comun'),
        ({'cultivos':['maiz']}, normales({6,7,8,9}), 'caupi'),
        ({'cultivos':['tomate'],'charcos':'si'}, normales(set(range(1,13))), 'canavalia')]:
        planes = motor._generar(exp,clima,HOY.year*12+HOY.month-1,'es')
        assert leg in [p['cultivo'] for p in planes[2]['cama']]
    rr = motor.comparar(SANTIAGO,n,ni,HOY)['estrategias']
    assert all(b['cultivo'] == a['cultivo'] for a,b in zip(rr[0]['tira'],rr[3]['tira']) if a['cultivo'])
    assert 'No cabe cobertura viva' in rr[3]['razon']
    assert all(a['cultivo'] == b['cultivo'] and a['kc'] == b['kc'] for a,b in zip(rr[0]['tira'],rr[1]['tira']))
    assert rr[0]['agua'] == rr[1]['agua']  # no atribuir ahorro numérico no modelado a hojas
    assert len(ni) == 12 and {x['mes'] for x in ni} == set(range(1,13))
    # Cero lluvia del análogo no se convierte por error en 100%.
    secos = normales(set())
    base = {'cultivos':['maiz'],'siembras':{'maiz':'2026-11'}}
    r = motor.comparar(base,secos,[{'mes':m,'pct_normal':0} for m in range(1,13)],HOY)
    assert r['estrategias'][0]['agua']['deficit_nino_mm'] == r['estrategias'][0]['agua']['demanda_seca_mm']
    assert r['estrategias'][0]['agua']['deficit_nino_mm'] > r['estrategias'][0]['agua']['deficit_normal_mm']
    # Toda siembra NUEVA (también segundas tandas de cobertura) empieza en húmedo.
    i0 = HOY.year * 12 + HOY.month - 1
    for exp, clima in casos + [
        ({'cultivos':['maiz','frijol_comun'],'siembras':{'maiz':'2026-10'}},kenya),
        ({'cultivos':['rabano'],'siembras':{'rabano':'2026-11'}},normales({11})),
        ({'cultivos':['maiz'],'siembras':{'maiz':'2026-11'}},normales(set()))]:
        humedos = motor.temporadas(clima)['meses_humedos']
        planes = motor._generar(exp,clima,i0,'es')
        for plan in planes[2:]:
            for paso in plan['cama']:
                if not paso.get('existente') and not paso.get('repeticion'):
                    assert paso['siembra'] % 12 + 1 in humedos, paso
                    assert paso['siembra'] < i0 + 12
            for campo in ('beneficios','riesgos','vacios'):
                assert len(plan[campo]) == len(set(plan[campo]))
        for lang in ('es','en'):
            comp = motor.comparar(exp,clima,[],HOY,lang)
            for e in comp['estrategias']:
                texto = ' '.join([e['nombre'],e['razon'],*e['beneficios'],*e['riesgos'],*e['vacios']])
                assert not re.search(r'\b20\d{2}-\d{2}\b', texto)
                assert ' / ' not in e['nombre']
            # Primer mes de maní bajo las copas también respeta la lluvia.
            vivo = comp['estrategias'][3]['arboles']
            cambio = next((m for m in vivo if m['nombre'] in ('maní forrajero','forage peanut (Arachis pintoi)')), None)
            if cambio:
                assert cambio['mes'] in humedos
    santiago = motor.comparar(SANTIAGO,n,ni,HOY)['estrategias']
    assert santiago[0]['nombre'] == 'Lo que haces hoy'
    assert santiago[0]['detalle'] == 'yuca tras yuca'
    assert santiago[2]['nombre'] == 'Rotar: frijol de bejuco, luego camote'
    # sin fecha de siembra el guandú no cabe antes de la próxima yuca: el nombre no lo promete
    assert santiago[3]['nombre'] == 'Maní forrajero bajo los árboles; en el huerto no cabe cobertura viva este año'
    assert not any(m.get('cultivo') == 'guandu' for m in santiago[3]['tira'])
    con_fecha = motor.comparar({**SANTIAGO, 'siembras': {'yuca': '2026-06'}}, n, ni, HOY)['estrategias'][3]
    assert con_fecha['nombre'].startswith('Guandú') and any(m.get('cultivo') == 'guandu' for m in con_fecha['tira'])
    for e in santiago:
        assert all(c not in e['nombre'].lower() + e['razon'].lower() for c in ('piña','plátano','cacao','naranja','toronja'))
    assert motor.nombre_cultivo('frijol_comun') == 'Frijol común'
    kexp = {'cultivos':['maiz','frijol_comun'],'siembras':{'maiz':'2026-10','frijol_comun':'2026-10'}}
    kr = motor.comparar(kexp,kenya,[],HOY)['estrategias'][2]
    assert kr['razon'].count('caupí en marzo de 2027') == 1
    assert 'batata en octubre de 2027' in kr['razon']
    assert 'maíz en octubre de 2027' in kr['razon']
    # Si la siguiente ventana cae fuera del horizonte, no se siembra: quedan hojas.
    solo_nov = normales({11})
    planes = motor._generar({'cultivos':['rabano'],'siembras':{'rabano':'2026-10'}},solo_nov,i0,'es')
    assert [p['cultivo'] for p in planes[2]['cama']] == ['rabano','caupi']
    assert 'fuera de estos doce meses' in planes[2]['razon']
    tira = motor.comparar({'cultivos':['rabano'],'siembras':{'rabano':'2026-10'}},solo_nov,[],HOY)['estrategias'][2]['tira']
    assert all(m['cultivo'] is None and m['nombre'] == 'hojas secas' for m in tira[3:])
    for lang in ('es','en'):
        arboles = motor.comparar({'cultivos':['mango']},n,[],HOY,lang)
        assert all('guandú' not in e['nombre'].lower() and 'pigeon pea' not in e['nombre'].lower() for e in arboles['estrategias'])
        texto = ' '.join(arboles['lectura'])
        assert '0 mm' not in texto
        assert ('Sin cálculo' if lang == 'es' else 'not calculated') in texto
    # Déficit cero con cultivo presente significa lluvia suficiente, no cama vacía.
    copia = json.loads(json.dumps(santiago))
    for e in copia:
        e['agua'] = {'demanda_seca_mm':10,'deficit_normal_mm':0,'deficit_nino_mm':0}
    assert '0 mm' in ' '.join(motor.lectura(copia,[]))
    for e in copia:
        e['agua']['demanda_seca_mm'] = 0
    assert 'camas de ciclo corto' in ' '.join(motor.lectura(copia,[]))
    # Regresiones de la auditoría: criterios, ausencia de camas, fotos y agua.
    for cultivos in ([], ['xyz'], ['mango']):
        out = motor.comparar({'cultivos': cultivos, 'prioridades': ['agua','comida']}, n, ni, HOY)
        for e in out['estrategias']:
            assert e['tira'] == [] and e['desnudo_cama'] is None
            assert all(v is None for v in e['agua'].values())
        assert 'sin cálculo' in ' '.join(out['lectura']).lower()
    base = {'cultivos': ['yuca'], 'siembras': {'yuca':'2026-11'}}
    out = motor.comparar({**base, 'prioridades':['venta']}, n, ni, HOY)
    assert 'Venta no se calcula' in ' '.join(out['lectura'])
    assert 'empatadas' not in ' '.join(out['lectura'])
    out = motor.comparar({**base, 'prioridades':['comida','trabajo','suelo','agua']}, n, ni, HOY)
    assert all(k + ':' in ' '.join(out['lectura']) for k in ('Comida','Trabajo','Suelo','Agua'))
    assert out['estrategias'][0]['comida_meses'] == 10
    assert motor._primera_comida([{'cultivo':'canavalia','siembra':i0}], i0) is None
    assert motor._primera_comida([{'cultivo':'guandu','siembra':i0,'abono_verde':True}], i0) is None
    assert motor._primera_comida([{'cultivo':'ajo','siembra':i0}], i0) is None
    assert motor._primera_comida([{'cultivo':'rabano','siembra':i0}], i0) == 1
    assert out['estrategias'][1]['labores']['tapar_hojas'] == 1
    assert sum(out['estrategias'][1]['labores'].values()) > sum(out['estrategias'][0]['labores'].values())
    gap = {'cultivos':['rabano'], 'siembras':{'rabano':'2026-11'}}
    vivo = motor.comparar(gap, normales(set(range(1,13))), [], HOY)['estrategias'][3]
    assert vivo['labores']['cortes'] > 0 and vivo['labores']['siembras'] > 1
    for hoj, cob in [('mucha','media'),('poca','baja')]:
        for fecha in ('2026-11-14','2026-12-01','2025-11-14','2026-08-01'):
            out = motor.comparar({**base,'fotos':[{'tipo':'cama','fecha':fecha,'cobertura':0,'hojarasca':hoj}]},n,ni,HOY)
            for e in out['estrategias']:
                medidos = [m for m in e['tira'] if m.get('medido')]
                assert len(medidos) == (1 if fecha[:7] in ('2026-11','2026-12') else 0)
                if medidos:
                    assert medidos[0]['mes'] == int(fecha[5:7]) and medidos[0]['cobertura'] == cob
    out = motor.comparar({**base,'charcos':'si','infiltracion_min':2},n,ni,HOY)
    for e in out['estrategias']:
        assert any('muy rápida' in x for x in e['ajustes'])
        assert any('Observaste charcos' in x for x in e['riesgos'])
        assert 'el agua se queda arriba' not in ' '.join(e['riesgos'])
    assert 'infiltracion' in {f['clave'] for f in motor.faltan({'charcos':'nose'})}
    assert 'infiltracion' in {f['clave'] for f in motor.faltan({'charcos':'nose','infiltracion_min':2})}
    # La rotación también cuenta el corte cuando usa un abono verde.
    rot = motor.comparar({'cultivos':['tomate'],'charcos':'si'},normales(set(range(1,13))),[],HOY)['estrategias'][2]
    assert rot['labores']['cortes'] == 1
    # Una cama desconocida no diluye con ceros el cálculo de otra conocida.
    conocido = motor.comparar(base,n,ni,HOY)['estrategias'][0]
    mixto = motor.comparar({**base,'cultivos':['yuca','xyz']},n,ni,HOY)['estrategias'][0]
    assert mixto['agua'] == conocido['agua'] and mixto['tira'] == conocido['tira']
    # La elección usa duración y labores, no cantidad de especies ni cambios de nombre.
    opciones = json.loads(json.dumps(out['estrategias']))
    for i, e in enumerate(opciones):
        e['comida_meses'] = 4 - i
        e['labores'] = {'siembras':i,'tapar_hojas':i,'cortes':i}
    assert opciones[-1]['nombre'] in motor.lectura(opciones,['comida'])[0]
    assert opciones[0]['nombre'] in motor.lectura(opciones,['trabajo'])[0]
    assert motor.lectura(opciones,['comida'])[0] == motor.lectura(opciones,['venta','comida'])[0]
    for fecha in ('2025-11-14','2026-08-01'):
        viejo = motor.comparar({'cultivos':['mango'],'fotos':[{'tipo':'perennes','fecha':fecha,'cobertura':90}]},n,ni,HOY)
        assert not any(m.get('medido') for e in viejo['estrategias'] for m in e['arboles'])
    nota = ' '.join(motor.comparar(SANTIAGO,n,ni,HOY)['lectura'])
    assert 'mismo déficit' in nota and 'meses secos' in nota
    assert 'no cuenta árboles, perennes, riego ni el ahorro por hojas' in nota
    with TestClient(app.app) as client, patch.object(app, '_clima', return_value=(kenya, {'promedio':[]})):
        assert client.post('/api/comparar', json={'expediente':{}}).json()['temporada'] == motor.temporadas(kenya)
    # Identidad de todas las claves, alias minúsculos, procedencia de cada nuevo número.
    assert len(motor.AGRO['cultivos']) >= 50
    for k,c in motor.AGRO['cultivos'].items():
        assert motor.buscar_cultivo(k) == k
        assert all(a == a.lower() for a in c['alias'])
        if c.get('kc') and 'F56T12' in c['fuentes']:
            assert c['fuentes_por_campo']['kc'] == ['F56T12']
    with TestClient(app.app) as client:
        es = client.get('/api/cultivos?lang=es').json()
        en = client.get('/api/cultivos?lang=en').json()
        assert len(es) == len(en) == 55
        assert es[0]['nombre'] == 'Yuca' and en[0]['nombre'] == 'Cassava'
        assert all(set(c) == {'id','nombre','cientifico','tipo','alias'} for c in es)
    print('OK: Santiago, Kenia, India, alias, desconocidos, fotos, temporadas, idioma y catálogo.')


if __name__ == '__main__':
    main()
