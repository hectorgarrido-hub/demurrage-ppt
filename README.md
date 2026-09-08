# demurrage-ppt

Calculadora de **laytime, demurrage/despatch y muellaje** para embarques en
**Puerto Punta Totoralillo (PPT)**.

Lee directamente el libro *Registro de Tiempos de Embarque* (`CNN-EMB-XXX.xlsx`)
y entrega el time sheet de la recalada: laytime permitido, tiempo usado, balance
y el monto en dólares que corresponde cobrar o pagar.

## Qué hace

| Bloque | Detalle |
|---|---|
| **Importación** | Arrastras el `.xlsx` del RTE y se completan nave, código, tonelaje, eslora, espías, horas de mantenimiento y las horas de cada categoría de detención. El archivo se lee en el navegador; no se sube a ningún servidor. |
| **Laytime** | Inicio por NOR + turn time o por 1ª espía. Allowed por tasa de embarque (t/día) o por horas fijas. Régimen SHINC, SHEX o SATSHEX, con festivos. |
| **Deducciones** | Las 21 categorías del RTE, cada una con su casilla de "descuenta del laytime". Se pueden agregar conceptos propios. |
| **Resultado** | Tiempo transcurrido → excluido por régimen → deducciones → laytime usado → balance → **demurrage** (pro rata sobre el rate diario) o **despatch** (porcentaje del rate). |
| **Muellaje** | `Muellaje US$ = tarifa (US$/m eslora/hora) × eslora × NWH`, con `NWH = (última espía − 1ª espía) − mtto. terminal − nave a la gira`. Misma fórmula de la hoja MUELLAJE. |
| **Índices** | DF, U y FO encadenados como en RESUMEN_TIEMPOS: `disponibles = total − mtto. terminal`, `operativas = disponibles − tiempos de nave`, y luego `DF = disponibles/total`, `U = operativas/disponibles`, `FO = op. efectiva/operativas`. |

Todo queda guardado en el navegador (`localStorage`), así que la recalada
en curso sigue ahí al volver a abrir la página.

## Uso

Es un sitio estático, sin build ni dependencias que instalar.

```bash
# local
python3 -m http.server 8000     # y abrir http://localhost:8000
```

Publicado en GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.

> Ábrelo servido (`http.server` o GitHub Pages), no con doble clic sobre el archivo:
> abrir `index.html` como `file://` bloquea la carga de los scripts en algunos navegadores.

### Sin conexión

SheetJS va incluido en el repositorio (`js/vendor/xlsx.full.min.js`, Apache-2.0), así que la
lectura del `.xlsx` funciona sin internet y detrás del firewall corporativo. Lo único que se
pide fuera es la tipografía de Google Fonts; si está bloqueada, la página cae a las fuentes
del sistema y sigue operando igual.

## Pruebas

El motor de cálculo no depende del DOM, así que se prueba con Node sin dependencias:

```bash
node tests/laytime.test.js
```

Incluye regresiones contra datos reales del embarque **CNN-EMB-434 / MN CHINA TRIUMPH**:
NWH 113,5 h, muellaje US$ 57.865,705 y los índices DF 98,695 % / U 93,8254 % / FO 70,0233 %,
los mismos valores que entrega la planilla.

## Estructura

```
index.html                    interfaz completa
js/laytime.js                 motor de cálculo (laytime, demurrage/despatch, muellaje, índices)
js/importar-rte.js            lectura del libro CNN-EMB-XXX.xlsx y clasificación de categorías
js/vendor/xlsx.full.min.js    SheetJS 0.18.5 (Apache-2.0), incluido para operar sin internet
tests/laytime.test.js         pruebas del motor
docs/glosario.md              términos de charter party usados en la app
```

## Supuestos del cálculo

Los valores por defecto son un punto de partida razonable, **no** una regla contractual:

- Se descuentan del laytime: eventos climáticos, fuerza mayor, incendio y todos los
  tiempos atribuibles a la nave (calado, deslastre, amarras, preparativo de maniobra).
- **No** se descuentan las detenciones del terminal (mantenimiento, atoros, correas,
  limpieza, cambio de turno, cambio de bodega, corridas): corren contra el fletador.
- Despatch por defecto en 50 % del demurrage rate, sobre *all time saved*.

Cada uno de estos criterios es editable en pantalla. El resultado definitivo depende
de la redacción del charter party y del Statement of Facts firmado por las partes.
