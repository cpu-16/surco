"""Registro sin cuentas: el enlace consulta y anota; solo la clave edita; cada guardado deja versión."""
import os
import tempfile
from pathlib import Path

import app
from fastapi.testclient import TestClient

app.AQUI = Path(tempfile.mkdtemp())  # base aparte: no toca los expedientes reales
c = TestClient(app.app)
r = c.post("/api/expediente", json={"datos": {"nombre": "Patio", "notas": []}}).json()
i, clave = r["id"], r["clave"]
assert r["version"] == 1
assert c.put(f"/api/expediente/{i}", json={"datos": {"nombre": "Otro"}}).status_code == 403
assert c.put(f"/api/expediente/{i}", json={"datos": {"nombre": "Otro"}}, headers={"x-clave": "mala"}).status_code == 403
assert c.post(f"/api/expediente/{i}/nota", json={"texto": "Revisar drenaje", "nombre": "Técnico MIDA"}).status_code == 200
assert c.post(f"/api/expediente/{i}/nota", json={"texto": "   "}).status_code == 400
ok = c.put(f"/api/expediente/{i}", json={"datos": {"nombre": "Patio 2", "notas": []}}, headers={"x-clave": clave}).json()
assert ok["version"] == 2
d = c.get(f"/api/expediente/{i}").json()
assert d["datos"]["nombre"] == "Patio 2" and d["datos"]["notas"][0]["texto"] == "Revisar drenaje"  # el celular no borra la nota del técnico
assert [v["n"] for v in d["versiones"]] == [1, 2]
assert c.get(f"/api/expediente/{i}/version/1").json()["datos"]["nombre"] == "Patio"
assert c.get("/api/expediente/nada").status_code == 404
print("OK: registro con clave, notas y versiones")
