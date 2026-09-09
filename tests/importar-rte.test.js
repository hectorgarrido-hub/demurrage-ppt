/**
 * Pruebas del lector del libro CNN-EMB-XXX.xlsx.  node tests/importar-rte.test.js
 *
 * El caso que motivó estas pruebas: el bloque de productividad del RTE se leía
 * con la etiqueta clavada en la columna B y el valor en la C.  En la planilla
 * real esos rótulos viven en celdas combinadas, así que Excel guarda el texto
 * en otra columna, la lectura devolvía null y las tres tasas salían en blanco
 * en el dashboard sin decir por qué.  Ahora se busca por texto, no por
 * coordenada, y estas pruebas fijan ese comportamiento.
 */
var XLSX = require("../js/vendor/xlsx.full.min.js");
var I = require("../js/importar-rte.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado, tol){
  total++;
  var ok = (typeof esperado === "number")
    ? Math.abs(obtenido - esperado) <= (tol === undefined ? 1e-6 : tol)
    : obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido +
    (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

/** Construye un libro a partir de {hoja: [[fila], ...]}. */
function libro(hojas){
  var wb = XLSX.utils.book_new();
  Object.keys(hojas).forEach(function(n){
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hojas[n]), n);
  });
  return XLSX.read(XLSX.write(wb, {type:"array", bookType:"xlsx"}), {type:"array", cellDates:true});
}
function fila(col, valores){          // deja `valores` a partir de la columna `col` (0=A)
  var f = [];
  for(var i=0;i<col;i++) f.push(null);
  return f.concat(valores);
}

/* Un RTE mínimo con el bloque de productividad en las columnas B/C/D,
   que es donde lo tenía la planilla que sirvió de modelo. */
function rteBase(colEtiqueta){
  var c = colEtiqueta;
  return [
    fila(0, ["RTE"]),
    fila(c, ["TOTAL TIEMPO DESDE INICIO EMBARQUE", 8289, "MINUTOS"]),
    fila(c, ["TOTAL TIEMPO DESDE INICIO EMBARQUE", 131.55, "HORAS"]),
    fila(c, ["TASA DE OPERACIÓN EFECTIVA", 2103, "TM/HORA"]),
    fila(c, ["TASA PROMEDIO DE EMBARQUE HORA", 1540, "TM/HORA"]),
    fila(c, ["TASA PROMEDIO DE EMBARQUE DÍA", 36953, "TM/DÍA"]),
    fila(c, ["TOTAL PESÓMETRO CORREA CT-08", 0, "TM"]),
    fila(c, ["TOTAL PESÓMETRO CORREA CT-09", 202550, "TM"]),
    fila(c, ["CALADO", 202550, "TM"])
  ];
}

/* ---------------------------------------------------------------- */
bloque("Bloque de productividad en su columna habitual (B/C/D)");
var d = I.desdeLibro(libro({RTE: rteBase(1)})).datos;
chequear("tasa de operación efectiva", d.tasaEfectiva, 2103);
chequear("tasa promedio hora",         d.tasaHora,     1540);
chequear("tasa promedio día",          d.tasaDia,      36953);
chequear("pesómetro CT-09",            d.pesometro09,  202550);
chequear("pesómetro CT-08 en cero",    d.pesometro08,  0);
chequear("calado",                     d.calado,       202550);
chequear("tonelaje toma el calado",    d.tonelaje,     202550);
chequear("origen del tonelaje",        d.origenTonelaje, "calado");
chequear("reloj: minutos pasados a horas", d.horasReloj, 138.15, 1e-9);
chequear("eventos en horas, no el mismo número", d.horasEventos, 131.55);

/* ---------------------------------------------------------------- */
bloque("El mismo bloque corrido de columna — el caso que fallaba");
// Celdas combinadas: Excel guarda el texto en la esquina superior izquierda,
// así que el rótulo aparece en A y no en B, y el valor queda más a la derecha.
var corrido = I.desdeLibro(libro({RTE: rteBase(0)})).datos;
chequear("tasa efectiva igual", corrido.tasaEfectiva, 2103);
chequear("tasa hora igual",     corrido.tasaHora,     1540);
chequear("tasa día igual",      corrido.tasaDia,      36953);
chequear("calado igual",        corrido.calado,       202550);

var lejos = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(10, ["TOTAL PESÓMETRO CORREA CT-09", null, null, null, null, null, null, null, 202550, "TM"]),
  fila(10, ["CALADO", null, null, null, null, null, null, null, 198300, "TM"])
]})).datos;
chequear("valor a ocho columnas de distancia", lejos.pesometro09, 202550);
chequear("calado distinto del pesómetro",      lejos.calado,      198300);

/* ---------------------------------------------------------------- */
bloque("Etiquetas que se parecen");
// "CALADO" no puede llevarse el valor de "CALADO PUERTO": son cosas distintas.
var parecidas = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["CALADO PUERTO", 3.5, "HORAS"]),
  fila(1, ["CALADO NAVE", 1.2, "HORAS"]),
  fila(1, ["CALADO", 202550, "TM"])
]})).datos;
chequear("CALADO exacto gana a CALADO PUERTO", parecidas.calado, 202550);

/* ---------------------------------------------------------------- */
bloque("Etiqueta repetida, desempatada por unidad");
// "TOTAL TIEMPO DESDE INICIO EMBARQUE" aparece dos veces y NO son lo mismo:
// una es el reloj del embarque y la otra la suma de eventos. Confundirlas
// cambia todas las tasas.
var invertido = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["TOTAL TIEMPO DESDE INICIO EMBARQUE", 131.55, "HORAS"]),
  fila(1, ["TOTAL TIEMPO DESDE INICIO EMBARQUE", 8289, "MINUTOS"])
]})).datos;
chequear("horas aunque vayan primero",  invertido.horasEventos, 131.55);
chequear("minutos aunque vayan después", invertido.horasReloj,  138.15, 1e-9);

/* ---------------------------------------------------------------- */
bloque("Cuando el bloque no está, se avisa en vez de callar");
var r = I.desdeLibro(libro({RTE: [fila(0, ["RTE"]), fila(0, ["sin bloque de productividad"])]}));
chequear("tasas nulas", r.datos.tasaDia, null);
var avisoTasas = r.avisos.filter(function(a){ return a.indexOf("bloque de tasas") >= 0; });
chequear("hay aviso de tasas ausentes", avisoTasas.length, 1);
var avisoTon = r.avisos.filter(function(a){ return a.indexOf("No se pudo leer el tonelaje") >= 0; });
chequear("hay aviso de tonelaje ausente", avisoTon.length, 1);

/* ---------------------------------------------------------------- */
bloque("Sin hoja RTE no se inventa nada");
var vacio = I.desdeLibro(libro({OTRA: [["nada"]]}));
chequear("tasa día nula", vacio.datos.tasaDia, null);
chequear("no avisa de tasas si no hay hoja RTE",
  vacio.avisos.filter(function(a){ return a.indexOf("bloque de tasas") >= 0; }).length, 0);


/* ---------------------------------------------------------------- */
bloque("Un tonelaje de cero no es un tonelaje");
// Regresión: buscar la etiqueta en toda la hoja alcanza también la fila de
// detenciones "CALADO", que puede venir en cero. Ese cero ganaba la cadena
// del tonelaje (0 != null) y dejaba el embarque entero sin cálculo: tonelaje
// 0, laytime allowed 0, ningún resultado y ninguna explicación.
var conCeroYPesometro = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["CALADO", 0, "HORAS"]),                          // detención en cero
  fila(1, ["TOTAL PESÓMETRO CORREA CT-09", 202550, "TM"])
]})).datos;
chequear("el cero no se toma como calado", conCeroYPesometro.calado, null);
chequear("cae al pesómetro",   conCeroYPesometro.tonelaje, 202550);
chequear("y lo dice",          conCeroYPesometro.origenTonelaje, "pesómetro CT-09");

// Cuando ambas filas existen, manda la que lleva la unidad TM.
var ambas = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["CALADO", 3.5, "HORAS"]),                        // detención con horas
  fila(1, ["CALADO", 201430, "TM"])                         // draft survey
]})).datos;
chequear("gana la fila en TM, no la de horas", ambas.calado, 201430);

var todoCero = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["CALADO", 0, "TM"]),
  fila(1, ["TOTAL PESÓMETRO CORREA CT-09", 0, "TM"])
]}));
chequear("sin ninguna cifra positiva, tonelaje nulo", todoCero.datos.tonelaje, null);
chequear("y se avisa",
  todoCero.avisos.filter(function(a){ return a.indexOf("No se pudo leer el tonelaje") >= 0; }).length, 1);

// El pesómetro CT-08 sí puede ser legítimamente cero: es una correa parada.
var ct08 = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]),
  fila(1, ["TOTAL PESÓMETRO CORREA CT-08", 0, "TM"]),
  fila(1, ["TOTAL PESÓMETRO CORREA CT-09", 202550, "TM"])
]})).datos;
chequear("CT-08 en cero se conserva como cero", ct08.pesometro08, 0);

/* ---------------------------------------------------------------- */
bloque("El tonelaje que no viene del calado se advierte");
var delPesometro = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]), fila(1, ["TOTAL PESÓMETRO CORREA CT-09", 202550, "TM"])]}));
chequear("avisa que no es el draft survey",
  delPesometro.avisos.filter(function(a){ return a.indexOf("no del calado") >= 0; }).length, 1);
var delCalado = I.desdeLibro(libro({RTE: [
  fila(0, ["RTE"]), fila(1, ["CALADO", 201430, "TM"])]}));
chequear("con calado no molesta",
  delCalado.avisos.filter(function(a){ return a.indexOf("no del calado") >= 0; }).length, 0);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
