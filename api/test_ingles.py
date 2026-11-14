"""Desde api/: uv run python test_ingles.py. Usa el clima POWER en caché."""
import datetime as dt
import json
from unittest.mock import patch
from fastapi.testclient import TestClient
import app
import ia
import motor
from test_general import power_cache, SANTIAGO


def main():
    p = power_cache()
    n = motor.clima_mensual(p['dias'])
    ni = motor.ninos(p['dias'], n)
    casos = [{}, {'prioridades': ['suelo'], 'charcos': 'si'},
             {'prioridades': ['agua'], 'infiltracion_min': 2, 'fotos': [{'tipo': 'perennes', 'cobertura': 5, 'hojarasca': 'mucha'}]},
             {'prioridades': ['comida'], 'infiltracion_min': 150, 'siembras': {'yuca': '2026-06'},
              'fotos': [{'tipo': 'cama', 'cobertura': 45}, {'tipo': 'perennes', 'cobertura': 0}]}]
    # Nombres dinámicos: ahora dependen de los cultivos del expediente.
    for exp in casos:
        exp = {**SANTIAGO, **exp}
        args = (exp, n, ni['promedio'], dt.date(2026, 11, 14))
        es = motor.comparar(*args, lang='es')
        # la huella del español fijó la salida durante la traducción (14-nov); los cambios de reglas posteriores la mueven a propósito
        assert es == motor.comparar(*args) == motor.comparar(*args, lang='fr')
        en = motor.comparar(*args, lang='en')
        assert en['estrategias'][0]['nombre'] == 'What you do now: cassava after cassava'
        assert [e['id'] for e in en['estrategias']] == ['actual', 'tapar', 'rotar', 'viva']
        assert es['lectura'] != en['lectura']
        assert 'Con lo que escogiste' not in json.dumps(en['lectura'])
        assert 'Foto del suelo' not in json.dumps(en['faltan'])
        for a, b in zip(es['faltan'], en['faltan']):
            assert a['clave'] == b['clave']
            assert a['texto'] != b['texto'] and a['cambia'] != b['cambia']
        for a, b in zip(es['estrategias'], en['estrategias']):
            for k in ('id', 'agua', 'meses_desnudo', 'n_kg_ha', 'familias', 'evidencia'):
                assert a[k] == b[k], k
            for k in ('ajustes', 'riesgos', 'vacios'):
                assert len(a[k]) == len(b[k])
                assert all(x != y for x, y in zip(a[k], b[k])), k
            for k in ('tira', 'arboles', 'plantas'):
                for x, y in zip(a[k], b[k]):
                    assert {k: v for k, v in x.items() if k != 'nombre'} == {k: v for k, v in y.items() if k != 'nombre'}
                    if x['nombre']:
                        assert x['nombre'] != y['nombre']
    for es, en in zip(motor.ESTR, motor.ESTR_EN):
        assert es.keys() == en.keys()
        for k in es:
            if k not in ('nombre', 'razon', 'beneficios', 'vacios', 'riesgos'):
                assert es[k] == en[k]
    for invalid in (None, 7, [], {}):
        assert app.Pedido(expediente={}, lang=invalid).lang == 'es'
        assert app.Charla(historia=[], expediente={}, lang=invalid).lang == 'es'
    jpeg = b'\xff\xd8\xff' + b'0' * 1000
    for lang in ('es', 'en', 'fr'):
        with patch.object(ia, '_claude', return_value={'hojarasca': 'mucha', 'propuesta': {'charcos': 'si'}}) as mock:
            assert ia.foto(jpeg, 'cama', lang)['hojarasca'] == 'mucha'
            assert mock.call_args.args[0] == ia.FOTO + (ia.INGLES if lang == 'en' else '')
            assert ia.pregunta([], {}, lang)['propuesta'] == {'charcos': 'si'}
            assert mock.call_args.args[0] == ia.PREG + ia.region({}) + (ia.INGLES if lang == 'en' else '')
    with TestClient(app.app) as client, patch.object(app, '_clima', return_value=(n, ni)):
        for lang in (None, 'es', 'en', 'fr'):
            fields = {} if lang is None else {'lang': lang}
            expected = 'en' if lang == 'en' else 'es'
            r = client.post('/api/comparar', json={'expediente': {}, **fields})
            assert r.status_code == 200
            assert r.json()['estrategias'][0]['nombre'] == ('What you do now: keep your existing plants' if expected == 'en' else 'Lo que haces hoy: conservar las plantas que ya tienes')
            with patch.object(ia, 'foto', return_value={}) as mock:
                assert client.post('/api/ia/foto', files={'foto': ('test.jpg', jpeg, 'image/jpeg')}, data=fields).status_code == 200
                assert mock.call_args.args[-1] == expected
            with patch.object(ia, 'pregunta', return_value={}) as mock:
                assert client.post('/api/ia/pregunta', json={'historia': [], 'expediente': {}, **fields}).status_code == 200
                assert mock.call_args.args[-1] == expected
    assert 'Panamá' not in ia.BASE and 'MIDA' not in ia.FOTO
    for exp, panama in [({'lat':8.1,'lon':-80.98,'pais':'IN'},True),
                        ({'lat':17.4,'lon':78.5,'pais':'PA'},False),
                        ({'lat':7.0,'lon':-83.1},True), ({'lat':9.7,'lon':-77.1},True),
                        ({'lat':9.71,'lon':-80},False), ({},False)]:
        for lang in ('es','en'):
            with TestClient(app.app) as client, patch.object(ia, '_claude', return_value={}) as mock:
                assert client.post('/api/ia/pregunta',json={'historia':[],'expediente':exp,'lang':lang}).status_code == 200
                prompt, content = mock.call_args.args
                assert ('Usa palabras panameñas' in prompt) == panama
                assert ('MIDA/IDIAP' in prompt) == panama
                assert ('el servicio de extensión agrícola de tu zona' in prompt)
                assert ('"pais": "PA"' in content[0]['text']) == panama
    print('OK: inglés, español idéntico en 4 casos, prompts y los 3 endpoints.')


if __name__ == '__main__':
    main()
