/**
 * Pruebas de la conciliación entre el time sheet propio y lo liquidado.
 * Ejecutar con:  node tests/conciliar.test.js
 */
var C = require("../js/conciliar.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado, tolerancia){
  total++;
  var ok;
  if(typeof esperado === "number"){
    ok = Math.abs(obtenido - esperado) <= (tolerancia === undefined ? 1e-6 : tolerancia);
  }else{
    ok = obtenido === esperado;
  }
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido + (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

/* ---------------------------------------------------------------- */
bloque("Normalización de nombres de nave");
chequear("quita el prefijo MN", C.normalizar("MN CHINA TRIUMPH"), "CHINA TRIUMPH");
chequear("quita M/V", C.normalizar("M/V Star Ariadne"), "STAR ARIADNE");
chequear("quita acentos y puntuación", C.normalizar("NAVIOS  PHOÉNIX."), "NAVIOS PHOENIX");
chequear("no come el nombre si no hay prefijo", C.normalizar("SEACON AFRICA"), "SEACON AFRICA");
// "MN" es prefijo, pero una nave que empiece por esas letras no debe perderlas.
chequear("no confunde prefijo con nombre", C.normalizar("MNEMOSYNE"), "MNEMOSYNE");

/* ---------------------------------------------------------------- */
bloque("Distancia de edición");
chequear("iguales", C.distancia("CHINA TRIUMPH", "CHINA TRIUMPH"), 0);
chequear("una letra cambiada", C.distancia("CHINA THIUMPH", "CHINA TRIUMPH"), 1);
chequear("vacío contra algo", C.distancia("", "ABC"), 3);

/* ---------------------------------------------------------------- */
bloque("Emparejar la recalada abierta con su fila de temporada");
var temporada = [
  {nave:"CHINA TRIUMPH", rate:41906, cargo:200894, demurrage:601264, despatch:0},
  {nave:"STAR ARIADNE",  rate:25000, cargo:180000, demurrage:0, despatch:-12000},
  {nave:"NAVIOS PHOENIX", rate:30000, cargo:170000, demurrage:50000, despatch:0}
];
chequear("coincidencia exacta", C.emparejar("CHINA TRIUMPH", temporada).fila.rate, 41906);
chequear("la exacta se marca como exacta", C.emparejar("CHINA TRIUMPH", temporada).exacta, true);
/* El caso real: el CNN-EMB-434 escribe "MN CHINA THIUMPH" y la reportería
   "CHINA TRIUMPH". Emparejar por igualdad exacta dejaba fuera justo la
   recalada donde la diferencia era de US$ 619.552. */
var aprox = C.emparejar("MN CHINA THIUMPH", temporada);
chequear("tolera una letra cambiada", aprox.fila.nave, "CHINA TRIUMPH");
chequear("y avisa que no fue exacta", aprox.exacta, false);
chequear("una nave que no está no se inventa", C.emparejar("CAPE HORN", temporada), null);
/* Dos naves distintas del mismo armador pueden diferir en pocas letras:
   conciliar contra la equivocada es peor que no conciliar. */
chequear("no empareja naves realmente distintas",
  C.emparejar("STAR ARIADNE", [{nave:"STAR ARIANNA", rate:1}]), null);
chequear("sin temporada no empareja", C.emparejar("CHINA TRIUMPH", []), null);
chequear("sin nombre no empareja", C.emparejar("", temporada), null);

/* ---------------------------------------------------------------- */
bloque("Naves con más de una recalada en la temporada");
/* La temporada 2026 tiene tres: NISEKO QUEEN, PIGI y MINERAL BOTSWANA.
   Quedarse con la primera del libro es tomar la equivocada la mitad de las
   veces. Con la NISEKO QUEEN eso conciliaba una recalada de Q3 contra la
   fila de Q2 —el NOR de abril sobre un carguío de septiembre— y el botón de
   adoptar metía 139 días de demurrage: US$ 4.655.597 que no existen en
   ninguna parte. */
var niseko = [
  {nave:"NISEKO QUEEN", trimestre:"Q2", rate:33417, cargo:52099, demurrage:260281.30, despatch:0,
   nor:new Date(2026,3,26,5,12), atb:new Date(2026,4,4,20,30),
   inicioCarga:new Date(2026,4,4,22,30), finCarga:new Date(2026,4,6,13,33)},
  {nave:"NISEKO QUEEN", trimestre:"Q3", rate:39471, cargo:206000, demurrage:1554170.63, despatch:0,
   nor:new Date(2026,7,1), atb:new Date(2026,8,10),
   inicioCarga:new Date(2026,8,10), finCarga:new Date(2026,8,16)}
];
var q3 = C.emparejar("MN NISEKO QUEEN", niseko, {finCarga:new Date(2026,8,15,18,31)});
chequear("la recalada de septiembre se empareja con Q3", q3.fila.trimestre, "Q3");
chequear("y trae su demurrage, no el de Q2", q3.fila.demurrage, 1554170.63);
chequear("no queda ambigua", q3.ambigua, false);
chequear("pero avisa que había dos candidatas", q3.candidatas, 2);
var q2 = C.emparejar("NISEKO QUEEN", niseko, {finCarga:new Date(2026,4,6,10,0)});
chequear("la recalada de mayo se empareja con Q2", q2.fila.trimestre, "Q2");
/* Sin fechas no hay forma de saber cuál es: no se concilia. */
var sinFecha = C.emparejar("NISEKO QUEEN", niseko, {});
chequear("sin fechas no elige una al azar", sinFecha.fila, null);
chequear("y lo declara ambigua", sinFecha.ambigua, true);
chequear("con motivo", /no hay fechas/.test(sinFecha.motivo), true);
/* Una fecha que no cuadra con ninguna tampoco autoriza a elegir. */
var lejos = C.emparejar("NISEKO QUEEN", niseko, {finCarga:new Date(2026,0,15)});
chequear("una fecha lejana a todas no empareja", lejos.fila, null);
chequear("con su motivo", /ninguna cuadra/.test(lejos.motivo), true);
/* Dos recaladas a menos de dos semanas no se distinguen con confianza:
   una recalada dura una semana. */
var juntas = C.emparejar("PIGI", [
  {nave:"PIGI", trimestre:"Q2", finCarga:new Date(2026,5,1,12,40), demurrage:66984},
  {nave:"PIGI", trimestre:"Q3", finCarga:new Date(2026,5,8,12,40), demurrage:100216}
], {finCarga:new Date(2026,5,4)});
chequear("dos fechas demasiado juntas quedan ambiguas", juntas.ambigua, true);
chequear("con su motivo", /demasiado parecidas/.test(juntas.motivo), true);
/* Una sola recalada no necesita fechas para nada. */
chequear("con una sola candidata las fechas no hacen falta",
  C.emparejar("CHINA TRIUMPH", temporada, {}).fila.rate, 41906);

/* ---------------------------------------------------------------- */
bloque("Conciliación — reproduce la CNN-EMB-434 contra la reportería 2026");
/* Lo que muestra el tablero hoy con los dos libros cargados:
     Recalada  : despatch US$ 18.287,50  (rate 30.000, inicio en 1ª espía)
     Temporada : demurrage US$ 601.264   (rate 41.906, NOR 14-ago)          */
var fila = {nave:"CHINA TRIUMPH", rate:41906, cargo:200894,
            demurrage:601264, despatch:0, nor:new Date(2026,7,14,7,54)};
var app = {
  tarifaDia: 30000, tonelaje: 202550, tasaDia: 30000,
  baseInicio: "amarre", nor: null, primeraEspia: new Date(2026,7,30,16,42),
  permitido: 162.04, horasUsadas: 132.78, neto: -18287.50
};
var c = C.conciliar(app, fila);
chequear("liquidado", c.liquidado, 601264);
chequear("propio", c.propio, -18287.5);
chequear("diferencia", c.diferencia, 619551.5, 0.01);
chequear("tres causas", c.causas.length, 3);
chequear("la primera es el rate", c.causas[0].clave, "rate");
chequear("la segunda es el NOR", c.causas[1].clave, "nor");
chequear("la tercera es el tonelaje", c.causas[2].clave, "tonelaje");
/* La causa del NOR es la que explica casi todo: 16,4 días de espera en rada
   a 41.906 US$/día. Es la que convierte un despatch en un demurrage. */
chequear("el NOR vale ~16,4 días de rate",
  Math.round(c.causas[1].monto), Math.round(16.36667 * 41906), 2000);
/* Dentro del laytime el rate no cambia nada: multiplica un exceso que no
   existe. No se le puede atribuir plata. */
chequear("el rate no suma monto si no hubo exceso", c.causas[0].monto, 0);
chequear("el despatch del libro entra con su signo",
  C.netoLiquidado({demurrage:0, despatch:-12000}), -12000);

bloque("Conciliación — sin diferencias que declarar");
var igual = C.conciliar(
  {tarifaDia:41906, tonelaje:200894, tasaDia:30000, nor:new Date(2026,7,14,7,54),
   permitido:160.72, horasUsadas:505.07, neto:601264},
  {nave:"CHINA TRIUMPH", rate:41906, cargo:200894, demurrage:601264, despatch:0,
   nor:new Date(2026,7,14,7,54)});
chequear("sin causas cuando todo calza", igual.causas.length, 0);
chequear("y sin diferencia", igual.diferencia, 0);
chequear("sin fila no concilia", C.conciliar(app, null), null);

bloque("Datos de contrato que la recalada puede adoptar");
var d = C.datosDeContrato(fila);
chequear("rate", d.tarifaDemurrage, 41906);
chequear("tonelaje", d.tonelaje, 200894);
chequear("NOR", d.nor.toISOString(), new Date(2026,7,14,7,54).toISOString());

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
