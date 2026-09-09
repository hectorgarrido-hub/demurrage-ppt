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
| **Una sola vista** | Todo el embarque vive en el dashboard. Lo que se consulta —la recalada, el charter party, las 21 categorías, la conexión— se pliega en bloques; lo que se lee —veredicto, cifra, KPIs, gráficos— queda siempre arriba. Las pestañas restantes cambian de sujeto, no de paso: **Flota** es la temporada y **Clima** es el terminal. |
| **Historial** | Cada embarque que cargas se guarda solo y queda en un desplegable de la barra superior, agrupado por mes y con el más reciente arriba. Se elige por fecha y se abre. El código de embarque lo identifica: reimportar actualiza, no duplica. |
| **Modo presentación** | Botón *Presentar*: pantalla completa con una idea por lámina, tipografía dimensionada para proyectar a tres o cuatro metros, navegación con flechas y exportación a PDF de una página por lámina. |
| **Veredicto** | Semáforo de la recalada con criterio explícito, y una lectura en prosa generada de los datos: lo que alguien repite después de la reunión. |
| **Time sheet en dinero** | La misma cascada, valorizada al rate del contrato: se ve cuánto descontó cada excepción. |
| **NOR en PDF** | Arrastras el Notice of Readiness de la agencia y se completan arribo, NOR presentado, free pratique y NOR aceptado. Muestra qué leyó para que lo compares con el papel antes de calcular, y avisa si las fechas no son coherentes o si el nombre de la nave no calza con el del registro de tiempos. |
| **Importación** | Arrastras el `.xlsx` del RTE y se completan nave, código, tonelaje, eslora, espías, horas de mantenimiento y las horas de cada categoría de detención. El archivo se lee en el navegador; no se sube a ningún servidor. |
| **Laytime** | Inicio por NOR + turn time o por 1ª espía. Allowed por tasa de embarque (t/día) o por horas fijas. Régimen SHINC, SHEX o SATSHEX, con festivos. |
| **Deducciones** | Las 21 categorías del RTE, cada una con su casilla de "descuenta del laytime". Se pueden agregar conceptos propios. |
| **Resultado** | Cifra protagonista con el **demurrage** (pro rata sobre el rate diario) o el **despatch**, más KPIs de allowed, usado, balance y muellaje. El despatch se pacta como **% del demurrage rate** o con **tarifa propia en US$/día**, según lo diga el contrato. Cada campo recalcula al editarlo. |
| **Gráficos** | Donut de composición del tiempo, **anillo de utilización del laytime** —el número que decide la recalada, en verde bajo 100 % y en rojo con el exceso pintado encima—, barras de causas ordenadas, cascada del time sheet con la línea del *allowed*, y medidores DF/U/FO. Todo en SVG dibujado a mano, sin librerías. |
| **Muellaje** | `Muellaje US$ = tarifa (US$/m eslora/hora) × eslora × NWH`, con `NWH = (última espía − 1ª espía) − mtto. terminal − nave a la gira`. Misma fórmula de la hoja MUELLAJE. |
| **Productividad** | Tonelaje partido en tres cifras que no son la misma: **embarcado** (pesómetro CT-09), **calado** (draft survey) y el que alimenta el cálculo, con la diferencia entre correa y draft escrita. Más tasa de operación efectiva, promedio horaria y diaria, **leídas del RTE, no recalculadas**; si el libro no trae el bloque, la app las calcula y lo dice. La tasa diaria se compara contra la pactada en el charter party. |
| **Tendencias** | Curvas de la temporada: rate de carga por recalada contra el objetivo del contrato, y % de detenciones controlables. Dos gráficos separados, nunca uno con dos ejes. |
| **Flota** | Consolida varias recaladas en una temporada: KPIs acumulados, diagrama de estadía, demurrage y despatch por nave, causas acumuladas y la tabla de recaladas. Se cargan varios `CNN-EMB` de una vez y quedan guardados en el navegador. |
| **Clima** | Panel de condiciones en el terminal con datos en línea (Open-Meteo, sin clave ni cuenta): viento, ráfagas, marejada y visibilidad hora a hora a 3 días, con el estado operacional del muelle y las ventanas adversas ya agrupadas. Los umbrales son editables y parten en **20 nudos** de viento. |
| **Índices** | DF, U y FO encadenados como en RESUMEN_TIEMPOS: `disponibles = total − mtto. terminal`, `operativas = disponibles − tiempos de nave`, y luego `DF = disponibles/total`, `U = operativas/disponibles`, `FO = op. efectiva/operativas`. |

Sin nube, todo queda en el navegador (`localStorage`). Con un proyecto de Supabase
conectado, el historial se comparte: quien abra el sitio ve y edita los mismos embarques.
Se configura en «Datos y contrato → Sincronización» o dejando los valores en
`js/config.js`; el SQL de la tabla está en `supabase/esquema.sql`.

**Sobre la seguridad**: la *anon key* de Supabase viaja en el navegador, es pública por
diseño. Lo único que separa estos datos de cualquiera que abra el sitio son las políticas
RLS. El esquema trae dos opciones y deja activa la de acceso anónimo, que sirve para
partir; acá hay montos de demurrage y tarifas de contrato, así que si el sitio queda
público en Netlify corresponde la opción B, que exige usuario autenticado.

**Conflictos**: gana el registro con `actualizado_en` más reciente, y esa marca la pone
quien edita, no el servidor. Un disparador en la base ignora las escrituras más viejas que
lo guardado, para que una copia rezagada que llega tarde no reviva y borre la corrección
de otra persona.

### Clima y alertas

El panel de clima consulta **Open-Meteo** (API abierta, sin clave ni registro) para el
punto del terminal (**26°51′17″S 70°48′53″W**, el que devuelve Windy al buscar el puerto
por nombre) y devuelve dos series horarias: el pronóstico
atmosférico (viento, ráfagas, dirección, visibilidad, precipitación) y el marino
(altura, período y dirección de la marejada), a tres días.

Con esas series arma tres cosas:

> **No es una estación meteorológica.** Open-Meteo entrega la salida de modelos globales
> (ECMWF y GFS, los mismos que usa Windy) interpolada a esas coordenadas, en celdas de 9 a
> 25 km. Sirve para anticipar, no para probar: un descuento de laytime por clima se
> respalda con el registro del terminal o un certificado oficial, no con esto.
>
> La marejada se pide unas millas al oeste (−70,88): el muelle está en tierra y el modelo
> marino solo tiene celdas de mar. Si aun así viene vacía, el panel lo dice — un dato
> ausente y un mar calmo no son lo mismo.

- **Estado operacional del muelle** — OPERABLE / DETENIDO / SEVERO, con el motivo
  escrito. No es un pronóstico bonito: es la lectura de si el shiploader opera.
- **Ventanas adversas** — las horas seguidas sobre umbral se agrupan en un solo aviso
  («hoy 14:00 → hoy 21:00 · 7 h · viento hasta 25 kn»), en vez de repetir hora por hora.
- **Ventana operativa** — cuántas horas quedan antes del próximo evento adverso.

Los umbrales por defecto salen de la operación de PPT y se editan en pantalla:

| Variable | Aviso | Alerta |
|---|---|---|
| Viento sostenido | **20 kn** | 25 kn |
| Ráfagas | — | 30 kn |
| Marejada (altura significativa) | 2,0 m | 2,5 m |
| Visibilidad | 2.000 m | 1.000 m |

El panel **no reemplaza a Windy**: hay un enlace directo al punto del terminal para
mirar el mapa. Lo que agrega es el umbral aplicado y la alerta escrita, que es lo que
después se pega en un correo o se cita en un time sheet.

> La API es pública y responde por HTTPS. Si la red de CMP bloquea la salida a
> `api.open-meteo.com`, el panel lo dice en pantalla en vez de mostrar datos viejos.

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
node tests/leer-nor.test.js   # lectura del NOR en PDF
node tests/lectura.test.js    # semáforo, lectura y cascada en dinero
node tests/nube.test.js       # fusión de historial local y remoto
node tests/clima.test.js      # umbrales, ventanas adversas y ventana operativa
node tests/importar-rte.test.js  # lectura del libro CNN-EMB-XXX.xlsx
```

Incluye regresiones contra datos reales del embarque **CNN-EMB-434 / MN CHINA TRIUMPH**:
NWH 113,5 h, muellaje US$ 57.865,705 y los índices DF 98,695 % / U 93,8254 % / FO 70,0233 %,
los mismos valores que entrega la planilla.

## Tres registros visuales

La capa operacional sigue ISA-101 (plana, para sala de control); sobre ella va la capa
de presentación del tablero (recuadros marcados, escena de puerto, iconografía); y
encima el **modo presentación**, dimensionado para proyectar: una idea por lámina,
tipografía en `clamp()` sobre el viewport y contraste alto. La misma vista sirve para
el proyector, para compartir pantalla y para el PDF, donde cada lámina es una página
con los tamaños fijados en puntos.

## La capa operacional y la de presentación

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
  que no están en los datos. El acumulado va plegado bajo el mismo gráfico, como su vista de tabla.
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
index.html                    dashboard, flota y clima en una sola página
css/cmp.css                   design system CMP (ISA-101 + marca)
js/app.js                     controlador: cálculo, render y persistencia
js/graficos.js                primitivas de gráfico en SVG (donut, barras, cascada, gantt, divergentes, líneas)
js/escena.js                  escena de puerto e iconos, en SVG en línea (sin imágenes externas)
js/flota.js                   temporada: alta, deduplicado por código y consolidado
js/laytime.js                 motor de cálculo (laytime, demurrage/despatch, muellaje, índices)
js/importar-rte.js            lectura del libro CNN-EMB-XXX.xlsx y clasificación de categorías
js/leer-nor.js                lectura del Notice of Readiness en PDF
js/lectura.js                 semáforo, lectura en prosa y cascada en dinero
js/presentacion.js            láminas para proyectar y para el PDF
js/nube.js                    sincronización con Supabase (leer, fusionar, subir)
js/clima.js                   clima del terminal: consulta, umbrales y ventanas adversas
js/vendor/xlsx.full.min.js    SheetJS 0.18.5 (Apache-2.0), incluido para operar sin internet
js/vendor/pdf.min.js          pdf.js 2.16.105 (Apache-2.0), ídem
tests/laytime.test.js         pruebas del motor
tests/flota.test.js           pruebas del consolidado de temporada
tests/leer-nor.test.js        pruebas del lector de NOR, con el texto real de un PDF escaneado
tests/lectura.test.js         pruebas del semáforo, la prosa y la cascada en dinero
tests/nube.test.js            pruebas de la fusión local/remoto y el orden de escritura
tests/clima.test.js           pruebas de umbrales, agrupación de ventanas y ventana operativa
tests/importar-rte.test.js    pruebas del lector del libro, con el bloque de tasas corrido de columna
supabase/esquema.sql          tabla, disparador y políticas RLS del historial compartido
docs/glosario.md              términos de charter party usados en la app
```

## Sobre el libro de origen

Todo lo que la app lee de `RESUMEN_TIEMPOS` son **fórmulas** que apuntan a la hoja RTE.
Si el libro se guarda con una herramienta que no recalcula (LibreOffice, un script, una
exportación), esas celdas quedan sin valor y las horas de detención llegarían en cero
—con el laytime usado más alto de lo real—. La app detecta ese caso y lo avisa en vez
de calcular en silencio: ábrelo en Excel, guárdalo de nuevo y vuelve a cargarlo.

El lector busca cada rótulo **por su texto, en cualquier columna**, no por coordenada. La versión anterior exigía la etiqueta en B y el valor en C, y en la planilla real esos rótulos viven en celdas combinadas: Excel guarda el texto en la esquina superior izquierda del bloque, así que la lectura devolvía vacío y las tres tasas salían en blanco en el dashboard sin decir por qué. Ahora, si el bloque de veras no está, se avisa.

Un tonelaje de **cero no es un tonelaje**: es un dato ausente. El RTE rotula "CALADO" tanto el draft survey como una fila de detenciones que puede venir vacía, y ese cero, tomado como tonelaje, dejaba el laytime allowed en cero y el embarque entero sin resultado. La cadena calado → pesómetro CT-09 → suma por bodegas solo acepta cifras positivas, prefiere la fila que lleva la unidad `TM`, y dice de cuál de las tres salió el número.

El bloque de productividad vive en **`RTE!B195:D201` y `RTE!K199:U201`** (duplicado en
`RTEAM!C190:E196`). La app lo lee en vez de recalcularlo, porque la planilla divide por el
tiempo de **eventos registrados** y no por el reloj del embarque, y esos dos no coinciden:
en la CNN-EMB-434 el reloj marca 138,15 h y los eventos suman 131,55 h. Recalcular por
fuera daría 35.188 t/día donde la operación reporta 36.953. Cuando esa diferencia supera
media hora, la app la muestra: son horas del embarque que ningún evento del RTE explica.

El tonelaje que manda es el **calado** (`RTE!S201`), con el pesómetro CT-09 como respaldo
y la suma por bodegas como último recurso.

Los hitos del **NOR** no están en el registro de tiempos, porque los emite la agencia
marítima y no el puerto: se leen del PDF del Notice of Readiness, o se cargan a mano
en «Datos y contrato». El ETA nominado no viene en el NOR y siempre va a mano. No se rellenan solos, porque inventar
el NOR cambia el resultado en silencio: en la CNN-EMB-434, con los hitos reales del
documento de la agencia, el mismo embarque pasa de **US$ 18.288 de despatch** (laytime
desde el amarre) a **US$ 446.925 de demurrage** (desde el NOR presentado el 14 de agosto,
16,4 días antes del amarre). Cuál de los tres corre lo define el charter party.

## Supuestos del cálculo

Los valores por defecto son un punto de partida razonable, **no** una regla contractual:

- Se descuentan del laytime: eventos climáticos, fuerza mayor, incendio y todos los
  tiempos atribuibles a la nave (calado, deslastre, amarras, preparativo de maniobra).
- **No** se descuentan las detenciones del terminal (mantenimiento, atoros, correas,
  limpieza, cambio de turno, cambio de bodega, corridas): corren contra el fletador.
- Despatch por defecto en 50 % del demurrage rate, sobre *all time saved*.

Cada uno de estos criterios es editable en pantalla. El resultado definitivo depende
de la redacción del charter party y del Statement of Facts firmado por las partes.
