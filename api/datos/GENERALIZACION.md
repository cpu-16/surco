# Motor 2026-11-15a

Solo backend. `estrategias*.json` quedan como referencia histórica; el motor ya no
las usa para construir calendarios. El esquema público se conserva.

## Catálogo y fuentes

Se conservan todos los campos originales de los 15 cultivos, añadiendo únicamente
`nombre_en` y `alias`. Se agregan 40 entradas (55 en total). Los nuevos Kc y etapas
se transcribieron de FAO-56, capítulo 6, tablas 12 y 11, respectivamente:
https://www.fao.org/4/x0490e/x0490e0b.htm (consultada el 14-nov-2026).
Las notas de cada entrada identifican la fila y la región del ejemplo de etapas;
no son calendarios universales. Kc inicial toma el valor del grupo cuando la tabla
lo deja en blanco en la fila individual. Los extremos de intervalos seleccionados
se indican en notas. En sorgo se conserva la suma de etapas 130 días y se advierte
que el total impreso de esa fila dice 140. No se interpolan números nuevos.

Nuevos cultivos con Kc null: ñame, otoe, malanga, papaya, cebollina, culantro,
cilantro, ñajú, mango y coco. Etapas null en esos mismos cultivos, más garbanzo,
café, aguacate y ajo. No se equipara cebollina con cebolla verde ni coco con la
categoría general de palmeras sin confirmar. Los 40 nuevos valores de fijación
de N quedan null. También quedan sin cuantificar raíces, tolerancia a sequía,
cobertura, residuos, mercado panameño y meses locales de siembra. La taxonomía y
los alias son identificadores de referencia, no una identificación de la variedad
local; véanse las notas. No se sustituyen fuentes panameñas de los 15 originales.

## Reglas y límites explícitos

- Búsqueda exacta por clave, nombre español/inglés o alias, ignorando tildes,
  mayúsculas y espacios exteriores. Desconocidos aparecen en `plantas` con
  `cientifico: null` y en `vacios`; nunca se les asigna Kc o N.
- Mes seco: lluvia < 0.5 × ET0. Se conservan todas las transiciones seco→húmedo,
  incluidas dos temporadas. Todo húmedo permite cualquier mes; todo seco no
  permite nuevas siembras de rotación/cobertura. No se simula riego.
- El análogo Niño incluye los doce meses junio–mayo de cada episodio; noviembre–
  abril mantiene los años de la versión previa. Un mes sin análogo usa factor 1.
- Una cama de igual superficie por cultivo de ciclo corto. Kc mensual es el
  promedio entre camas, incluyendo las camas vacías con Kc 0. Cobertura toma el
  mínimo (criterio conservador). La clave `cultivo` de la tira representa la
  primera cama ocupada, `nombre` enumera las camas y `plantas` conserva todos los
  cultivos propuestos. No se suman mm entre camas ni se presenta un volumen.
- Los perennes permanecen en `plantas`; no se arrancan ni rotan. Árboles y Musa
  tienen una tira de suelo bajo las copas; piña, guandú y caña no se tratan como
  árboles. El cálculo de agua excluye perennes y sotobosque, como la comparación
  anterior. No es una estimación del agua total de la finca.
- Sin fecha válida, se supone el último inicio de lluvias anterior a hoy (o el
  mes actual si no hay transición). Esto se declara en `vacios`. Actual y tapar
  repiten anualmente en el mes original, sin solapar una cosecha más larga que
  un año. Rotar conserva la primera cosecha y espera el siguiente inicio de
  lluvias, luego una familia diferente tanto al cultivo inicial como a la
  leguminosa. No se ajustan etapas por grados-día ni se detectan heladas.
- Leguminosa: >1500 m, frijol común; seca ≥4 meses, caupí; en otro caso, canavalia
  con charcos/infiltración lenta o espera hasta lluvias ≥4 meses; si no, caupí.
  Son reglas de selección inicial, no una validación agronómica para cada país.
- Viva conserva la cosecha actual y dedica los huecos posteriores a guandú si
  hay árboles, con maní forrajero debajo; sin árboles, canavalia (seca ≥4 meses)
  o mucuna. Solo se establece en meses húmedos. Hojas protegen mientras tanto.
  Canavalia/mucuna se cortan a un máximo supuesto de 80 días por tanda. No se
  proponen sus semillas como comida. Maní forrajero tarda tres meses supuestos
  en cerrar; hay que validar adaptación y disponibilidad de semilla.
- Fallback explícito, nunca guardado como dato del cultivo: Kc de caupí
  0.4/1.05/0.35; ciclo 120 días cuando falta; etapas 20/40/(ciclo−90)/30,
  con mínimo de un día en la tercera etapa y reescalado al corte. Cobertura
  media cuando falta. Se conserva el máximo del ciclo publicado si existe.
- Tapar eleva a baja la cobertura mínima también entre plantas; no se descuenta
  agua del Kc por hojas. Fotos corrigen el primer mes; la foto bajo copas corrige
  todo el año de actual, declarando esa extrapolación.
- Fijación de N conserva los rangos publicados por planta, solo para cultivos
  presentes en el horizonte. La suma heredada es un indicador para ordenar,
  no una dosis ni N disponible. No se conocen áreas, biomasa ni incorporación.
- Venta no discrimina opciones sin precios y mercado local. Los demás criterios
  conservan las reglas simples previas; la tira es un resumen, no un diseño de
  asociación espacial. Con charcos o infiltración lenta, lectura identifica viva
  como ayuda potencial a la estructura, sin atribuirle drenaje medido.

## Santiago: resultado de la comprobación

POWER en cache.sqlite para 8.10, −80.98, normales 1991–2020:

| Mes | Lluvia mm | ET0 mm | Seco con umbral 0.5 |
|---|---:|---:|---|
| diciembre | 82 | 97 | no |
| enero | 20 | 115 | sí |
| febrero | 10 | 137 | sí |
| marzo | 18 | 179 | sí |
| abril | 93 | 154 | no |

Por tanto, el umbral solicitado produce **enero–marzo e inicio en abril**, no
exactamente diciembre–abril. No se alteraron datos ni umbral para forzar ese
resultado. Es el núcleo de la seca regional; los meses de transición quedan fuera.

Con EJEMPLO y fecha 2026-11-14, sin fechas de siembra ni fotos, actual mantiene
la yuca y los perennes; tapar añade solo hojas; rotar propone caupí en abril y
camote en julio; viva propone guandú y maní forrajero desde abril. Se sustituye
la antigua alternativa fija canavalia→maíz por tapar. Canavalia sigue disponible
si la regla climática/de suelo la elige.

Antes: desnudo cama/árboles 3/12, 1/0, 2/0, 1/0. Ahora: 3/12, 0/0, 0/0, 0/0.
El déficit normal cambia de 109 a 44 mm y el análogo Niño de 125 a 55 mm en las
cuatro opciones, por el nuevo periodo seco y la fecha supuesta abril en lugar
de mayo; **no es ahorro de agua demostrado por cambiar de estrategia**.

## Verificación sin red

Desde `api/`: `uv run python test_general.py`, `uv run python test_ingles.py`,
`uv run python test_registro.py`. POWER usa fechas fijas y lee la caché en modo
solo lectura; si falta, falla sin consultar la red. Kenia e India usan normales
sintéticas para probar reglas, no para afirmar resultados climáticos locales.
