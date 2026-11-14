"""Desde api/: uv run python test_ingles.py. Usa el clima POWER en caché."""
import datetime as dt
import hashlib
import json
from unittest.mock import patch
from fastapi.testclient import TestClient
import app
import ia
import motor
import nasa


def main():
    p = nasa.power(8.10, -80.98)
    n = motor.clima_mensual(p['dias'])
    ni = motor.ninos(p['dias'], n)
    casos = [{}, {'prioridades': ['suelo'], 'charcos': 'si'},
             {'prioridades': ['agua'], 'infiltracion_min': 2, 'fotos': [{'tipo': 'perennes', 'cobertura': 5, 'hojarasca': 'mucha'}]},
             {'prioridades': ['comida'], 'infiltracion_min': 150, 'siembras': {'yuca': '2026-06'},
              'fotos': [{'tipo': 'cama', 'cobertura': 45}, {'tipo': 'perennes', 'cobertura': 0}]}]
    # Respuestas completas del motor original, capturadas antes de los cambios.
    huellas = ['cb88e53370a9620fc72f5abdac7ce360dedb95a4092115f6c2e9eb1f82c0e539',
               'c4e5283d9a43ebdc4d4356da979738485c374b2d441d3e6e69abc6af5b3679c5',
               'a0279d87ba8a00e18328e24d513b0d90aa7ab0a7bffe0665923b5a1c8e0aa950',
               '3059947a4b29f67b2ef256ba97f432e7c952fc84efc6af1d67f940f6985c4b6c']
    nombres = ['Current practice: cassava after cassava',
               'Cover the soil with dry leaves (mulch), cowpea and sweet potato',
               'Cover the soil with dry leaves (mulch), jack bean to feed the soil, and corn',
               'Pigeon pea in the garden plot and forage peanut (Arachis pintoi) under the trees']
    for exp, huella in zip(casos, huellas):
        args = (exp, n, ni['promedio'], dt.date(2026, 11, 14))
        es = motor.comparar(*args, lang='es')
        assert hashlib.sha256(json.dumps(es, ensure_ascii=False, sort_keys=True).encode()).hexdigest() == huella
        assert es == motor.comparar(*args) == motor.comparar(*args, lang='fr')
        en = motor.comparar(*args, lang='en')
        assert [e['nombre'] for e in en['estrategias']] == nombres
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
            assert mock.call_args.args[0] == ia.PREG + (ia.INGLES if lang == 'en' else '')
    with TestClient(app.app) as client, patch.object(app, '_clima', return_value=(n, ni)):
        for lang in (None, 'es', 'en', 'fr'):
            fields = {} if lang is None else {'lang': lang}
            expected = 'en' if lang == 'en' else 'es'
            r = client.post('/api/comparar', json={'expediente': {}, **fields})
            assert r.status_code == 200
            assert r.json()['estrategias'][0]['nombre'] == (nombres[0] if expected == 'en' else motor.ESTR[0]['nombre'])
            with patch.object(ia, 'foto', return_value={}) as mock:
                assert client.post('/api/ia/foto', files={'foto': ('test.jpg', jpeg, 'image/jpeg')}, data=fields).status_code == 200
                assert mock.call_args.args[-1] == expected
            with patch.object(ia, 'pregunta', return_value={}) as mock:
                assert client.post('/api/ia/pregunta', json={'historia': [], 'expediente': {}, **fields}).status_code == 200
                assert mock.call_args.args[-1] == expected
    print('OK: inglés, español idéntico en 4 casos, prompts y los 3 endpoints.')


if __name__ == '__main__':
    main()
