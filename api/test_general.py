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


def main():
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
    campos = {'id','nombre','aplica_a','tira','arboles','meses_desnudo','desnudo_cama','desnudo_arboles','n_kg_ha','n_por_planta','familias','agua','plantas','razon','beneficios','vacios','riesgos','ajustes','evidencia'}
    for exp, clima in casos:
        es = motor.comparar(exp,clima,ni,HOY)
        en = motor.comparar(exp,clima,ni,HOY,lang='en')
        assert numerico(es) == numerico(en)
        assert es['version'] == '2026-11-15a'
        assert [e['id'] for e in es['estrategias']] == ['actual','tapar','rotar','viva']
        for e in es['estrategias']:
            assert set(e) == campos
            assert len(e['tira']) == 12
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
            assert all(e['agua']['demanda_seca_mm'] == 0 for e in es['estrategias'])
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
    foto = {**SANTIAGO,'charcos':'si','infiltracion_min':2,'fotos':[{'tipo':'perennes','cobertura':5,'hojarasca':'mucha'},{'tipo':'cama','cobertura':45}]}
    r = motor.comparar(foto,n,ni,HOY)
    assert r['estrategias'][0]['desnudo_arboles'] == 0
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
    assert any(m['cultivo'] == 'guandu' for m in rr[3]['tira'])
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
                if not paso.get('existente'):
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
    assert santiago[0]['nombre'] == 'Lo que haces hoy: yuca tras yuca'
    assert santiago[2]['nombre'] == 'Rotar: frijol de bejuco y luego camote después de la yuca'
    assert santiago[3]['nombre'] == 'Guandú en el huerto y maní forrajero bajo los árboles'
    for e in santiago:
        assert all(c not in e['nombre'].lower() + e['razon'].lower() for c in ('piña','plátano','cacao','naranja','toronja'))
    assert motor.nombre_cultivo('frijol_comun') == 'Frijol común'
    kexp = {'cultivos':['maiz','frijol_comun'],'siembras':{'maiz':'2026-10','frijol_comun':'2026-10'}}
    kr = motor.comparar(kexp,kenya,[],HOY)['estrategias'][2]
    assert kr['razon'].count('frijol de bejuco en marzo de 2027') == 1
    assert 'camote en octubre de 2027' in kr['razon']
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
        assert ('no hace falta riego' if lang == 'es' else 'need no irrigation') in texto
    # Déficit cero con cultivo presente significa lluvia suficiente, no cama vacía.
    copia = json.loads(json.dumps(santiago))
    for e in copia:
        e['agua'] = {'demanda_seca_mm':10,'deficit_normal_mm':0,'deficit_nino_mm':0}
    assert 'lluvia efectiva cubre' in ' '.join(motor.lectura(copia,[])).lower()
    for e in copia:
        e['agua']['demanda_seca_mm'] = 0
    assert 'no tiene cultivo' in ' '.join(motor.lectura(copia,[]))
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
