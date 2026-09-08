# demurrage-ppt

Calculadora de **laytime, demurrage/despatch y muellaje** para embarques en
**Puerto Punta Totoralillo (PPT)**.

Dashboard operacional que lee directamente el libro *Registro de Tiempos de Embarque*
(`CNN-EMB-XXX.xlsx`) y entrega el estado completo de la recalada: laytime permitido,
tiempo usado, balance, el monto en dólares que corresponde cobrar o pagar, la
composición del tiempo, el ranking de causas de detención y los índices del embarque.

Sigue el design system CMP (ISA-101 High Performance HMI + identidad de marca) usado
en el resto de las aplicaciones operacionales de Punta Totoralillo.

## Qué hace

| Bloque | Detalle |
|---|---|
| **Importación** | Arrastras el `.xlsx` del RTE y se completan nave, código, tonelaje, eslora, espías, horas de mantenimiento y las horas de cada categoría de detención. El archivo se lee en el navegador; no se sube a ningún servidor. |
| **Laytime** | Inicio por NOR + turn time o por 1ª espía. Allowed por tasa de embarque (t/día) o por horas fijas. Régimen SHINC, SHEX o SATSHEX, con festivos. |
| **Deducciones** | Las 21 categorías del RTE, cada una con su casilla de "descuenta del laytime". Se pueden agregar conceptos propios. |
| **Resultado** | Cifra protagonista con el **demurrage** (pro rata sobre el rate diario) o el **despatch**, más KPIs de allowed, usado, balance y muellaje. |
| **Gráficos** | Donut de composición del tiempo, barras de causas de detención ordenadas, cascada del time sheet con la línea del *allowed*, y medidores DF/U/FO. Todo en SVG dibujado a mano, sin librerías. |
| **Muellaje** | `Muellaje US$ = tarifa (US$/m eslora/hora) × eslora × NWH`, con `NWH = (última espía − 1ª espía) − mtto. terminal − nave a la gira`. Misma fórmula de la hoja MUELLAJE. |
| **Productividad** | Tasa de operación efectiva, tasa promedio horaria y diaria, calado y pesómetros — **leídos del RTE, no recalculados**. La tasa diaria se compara contra la pactada en el charter party. |
| **Tendencias** | Curvas de la temporada: rate de carga por recalada contra el objetivo del contrato, y % de detenciones controlables. Dos gráficos separados, nunca uno con dos ejes. |
| **Flota** | Consolida varias recaladas en una temporada: KPIs acumulados, diagrama de estadía, demurrage y despatch por nave, causas acumuladas y la tabla de recaladas. Se cargan varios `CNN-EMB` de una vez y quedan guardados en el navegador. |
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
node tests/laytime.test.js    # motor de laytime, muellaje e índices
node tests/flota.test.js      # alta, deduplicado y consolidado de temporada
```

Incluye regresiones contra datos reales del embarque **CNN-EMB-434 / MN CHINA TRIUMPH**:
NWH 113,5 h, muellaje US$ 57.865,705 y los índices DF 98,695 % / U 93,8254 % / FO 70,0233 %,
los mismos valores que entrega la planilla.

## Dos registros visuales

La capa operacional sigue ISA-101 (High Performance HMI): plana y callada, pensada
para sala de control. Estas vistas, en cambio, se presentan a gerencia — otro público
y otra distancia de lectura —, así que sobre esos mismos tokens va una **capa de
presentación**: recuadros marcados con acento de color, cabecera con escena de puerto,
iconografía de embarque y cifras de mayor tamaño.

Lo que no cambia entre un registro y otro son las reglas de los gráficos: marcas finas,
grilla recesiva, sin ejes dobles y la misma paleta de series validada.

La escena y los iconos son **SVG en línea, no imágenes**: la app tiene que verse igual
sin conexión y detrás del firewall, y una foto pesada compite con los datos.

## Decisiones de visualización

Tres cosas se apartan a propósito del reporte Power BI equivalente:

- **Sin eje doble en el Pareto.** La curva de % acumulado sobre las barras obliga a un
  segundo eje y, cuya alineación con el primero es arbitraria y sugiere correlaciones
  que no están en los datos. El acumulado va en la tabla de ranking, que además es la
  vista accesible del mismo gráfico.
- **El donut muestra tres categorías, no dos.** Un donut de dos porciones es una cifra
  disfrazada de gráfico: la composición completa (efectiva / no controlable /
  controlable) sí aporta, y el % controlable queda como nota del panel.
- **La paleta de series está validada, no elegida a ojo.** Los tres colores pasan las
  seis comprobaciones sobre la superficie oscura del panel: banda de luminosidad, piso
  de croma, separación bajo protanopia y deuteranopia, piso de visión normal y
  contraste. El orden verde → azul → naranja es el orden de apilado y no se altera:
  es lo que mantiene separados los pares que se tocan.

## Estructura

```
index.html                    dashboard + vista de datos y contrato
css/cmp.css                   design system CMP (ISA-101 + marca)
js/app.js                     controlador: cálculo, render y persistencia
js/graficos.js                primitivas de gráfico en SVG (donut, barras, cascada, gantt, divergentes, líneas)
js/escena.js                  escena de puerto e iconos, en SVG en línea (sin imágenes externas)
js/flota.js                   temporada: alta, deduplicado por código y consolidado
js/laytime.js                 motor de cálculo (laytime, demurrage/despatch, muellaje, índices)
js/importar-rte.js            lectura del libro CNN-EMB-XXX.xlsx y clasificación de categorías
js/vendor/xlsx.full.min.js    SheetJS 0.18.5 (Apache-2.0), incluido para operar sin internet
tests/laytime.test.js         pruebas del motor
tests/flota.test.js           pruebas del consolidado de temporada
docs/glosario.md              términos de charter party usados en la app
```

## Sobre el libro de origen

Todo lo que la app lee de `RESUMEN_TIEMPOS` son **fórmulas** que apuntan a la hoja RTE.
Si el libro se guarda con una herramienta que no recalcula (LibreOffice, un script, una
exportación), esas celdas quedan sin valor y las horas de detención llegarían en cero
—con el laytime usado más alto de lo real—. La app detecta ese caso y lo avisa en vez
de calcular en silencio: ábrelo en Excel, guárdalo de nuevo y vuelve a cargarlo.

El bloque de productividad vive en **`RTE!B195:D201` y `RTE!K199:U201`** (duplicado en
`RTEAM!C190:E196`). La app lo lee en vez de recalcularlo, porque la planilla divide por el
tiempo de **eventos registrados** y no por el reloj del embarque, y esos dos no coinciden:
en la CNN-EMB-434 el reloj marca 138,15 h y los eventos suman 131,55 h. Recalcular por
fuera daría 35.188 t/día donde la operación reporta 36.953. Cuando esa diferencia supera
media hora, la app la muestra: son horas del embarque que ningún evento del RTE explica.

El tonelaje que manda es el **calado** (`RTE!S201`), con el pesómetro CT-09 como respaldo
y la suma por bodegas como último recurso.

El **NOR** no está en el registro de tiempos, porque lo emite la agencia marítima y no
el puerto. Al importar se asume igual a la 1ª espía; corrígelo en «Datos y contrato»
para que el diagrama de estadía muestre la espera real.

## Supuestos del cálculo

Los valores por defecto son un punto de partida razonable, **no** una regla contractual:

- Se descuentan del laytime: eventos climáticos, fuerza mayor, incendio y todos los
  tiempos atribuibles a la nave (calado, deslastre, amarras, preparativo de maniobra).
- **No** se descuentan las detenciones del terminal (mantenimiento, atoros, correas,
  limpieza, cambio de turno, cambio de bodega, corridas): corren contra el fletador.
- Despatch por defecto en 50 % del demurrage rate, sobre *all time saved*.

Cada uno de estos criterios es editable en pantalla. El resultado definitivo depende
de la redacción del charter party y del Statement of Facts firmado por las partes.
