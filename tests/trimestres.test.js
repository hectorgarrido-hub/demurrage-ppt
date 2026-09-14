/**
 * Pruebas del consolidado por trimestre.  node tests/trimestres.test.js
 *
 * Las regresiones al final son contra la temporada 2026 real de Punta
 * Totoralillo: si el día de mañana alguien cambia una suma, estas cifras
 * dejan de cuadrar y se nota antes de presentarlas a gerencia.
 */
var T = require("../js/trimestres.js");

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
function F(s){ var m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); return new Date(+m[1], +m[2]-1, +m[3]); }

/* ---------------------------------------------------------------- */
bloque("Agregación básica");
var datos = {
  recaladas: [
    {trimestre:"Q1", nave:"UNO",  cargo:100000, demurrage:50000, despatch:0,
     nor:F("2026-01-01"), atb:F("2026-01-06"), eta:F("2026-01-02"),
     laycanDesde:F("2026-01-01"), laycanHasta:F("2026-01-05")},
    {trimestre:"Q1", nave:"DOS",  cargo:100000, demurrage:0, despatch:-10000,
     nor:F("2026-02-01"), atb:F("2026-02-02"), eta:F("2026-02-10"),
     laycanDesde:F("2026-02-01"), laycanHasta:F("2026-02-05")},
    {trimestre:"Q2", nave:"TRES", cargo:200000, demurrage:300000, despatch:0,
     nor:F("2026-04-01"), atb:F("2026-04-11"), eta:F("2026-03-20"),
     laycanDesde:F("2026-04-01"), laycanHasta:F("2026-04-05")}
  ],
  tiempos: [
    {trimestre:"Q1", nave:"UNO",  esperaAmarre:5, operacionCarga:6, timeAllowed:7},
    {trimestre:"Q1", nave:"DOS",  esperaAmarre:1, operacionCarga:5, timeAllowed:7},
    {trimestre:"Q2", nave:"TRES", esperaAmarre:10, operacionCarga:9, timeAllowed:7}
  ],
  detenciones: [
    {trimestre:"Q1", categoria:"WEATHER", dias:2, costo:20000},
    {trimestre:"Q1", categoria:"WEATHER", dias:1, costo:10000},
    {trimestre:"Q1", categoria:"TERMINAL MAINTENANCE", dias:4, costo:40000},
    {trimestre:"Q2", categoria:"GENERAL CONGESTION", dias:8, costo:80000}
  ],
  clima: [
    {trimestre:"Q1", causa:"Marejada", dias:2},
    {trimestre:"Q2", causa:"Viento", dias:3}
  ]
};
var qs = T.porTrimestre(datos);
chequear("dos trimestres", qs.length, 2);
chequear("en orden Q1, Q2", qs[0].trimestre + "," + qs[1].trimestre, "Q1,Q2");
chequear("naves de Q1", qs[0].naves, 2);
chequear("demurrage de Q1", qs[0].demurrage, 50000);
chequear("el despatch se guarda como magnitud", qs[0].despatch, 10000);
chequear("el neto lo resta", qs[0].neto, 40000);
chequear("US$ por tonelada", qs[0].usdPorTonelada, 40000/200000, 1e-9);
chequear("naves en demurrage", qs[0].enDemurrage, 1);
chequear("naves en despatch", qs[0].enDespatch, 1);

/* ---------------------------------------------------------------- */
bloque("Espera contra operación — la comparación que importa");
chequear("espera de Q1", qs[0].espera, 6);
chequear("operación de Q1", qs[0].operacion, 11);
chequear("allowed de Q1", qs[0].allowed, 14);
chequear("las dos naves de Q1 cargaron dentro del allowed", qs[0].dentroDelAllowed, 2);
chequear("la de Q2 no", qs[1].dentroDelAllowed, 0);
chequear("uso del allowed en Q1", qs[0].usoDelAllowed, 11/14*100, 1e-9);
/* La nave con demurrage esperó 5 días; la de despatch, 1. Separar los dos
   promedios es lo que muestra que la espera y el monto van juntos. */
chequear("espera media con demurrage", qs[0].esperaConDemurrage, 5);
chequear("espera media sin demurrage", qs[0].esperaSinDemurrage, 1);

/* ---------------------------------------------------------------- */
bloque("Laycan");
chequear("UNO llegó dentro", T.estadoLaycan(datos.recaladas[0]), "dentro");
chequear("DOS llegó tarde",  T.estadoLaycan(datos.recaladas[1]), "tarde");
chequear("TRES llegó antes", T.estadoLaycan(datos.recaladas[2]), "antes");
chequear("sin fechas no se inventa", T.estadoLaycan({nave:"X"}), null);
chequear("conteo de Q1", qs[0].laycan.dentro + "/" + qs[0].laycan.tarde, "1/1");

/* ---------------------------------------------------------------- */
bloque("Detenciones por categoría");
chequear("dos categorías en Q1", qs[0].detenciones.length, 2);
chequear("la mayor primero", qs[0].detenciones[0].categoria, "TERMINAL MAINTENANCE");
chequear("WEATHER suma sus dos eventos", qs[0].detenciones[1].dias, 3);
chequear("y su costo", qs[0].detenciones[1].costo, 30000);
chequear("cuenta los eventos", qs[0].detenciones[1].eventos, 2);
chequear("días detenidos de Q1", qs[0].diasDetenidos, 7);
chequear("días de clima de Q1", qs[0].diasClima, 2);

/* ---------------------------------------------------------------- */
bloque("Totales de la temporada");
var t = T.total(qs);
chequear("naves", t.naves, 3);
chequear("demurrage", t.demurrage, 350000);
chequear("despatch", t.despatch, 10000);
chequear("neto", t.neto, 340000);
chequear("espera total", t.espera, 16);
chequear("operación total", t.operacion, 20);
chequear("dentro del allowed", t.dentroDelAllowed, 2);
chequear("sin trimestres, todo en cero", T.total([]).neto, 0);

/* ---------------------------------------------------------------- */
bloque("Cruce por nave: la misma nave en dos trimestres");
/* PIGI, NISEKO QUEEN y MINERAL BOTSWANA aparecen dos veces en la temporada
   real. Sin desempatar por trimestre, la segunda recalada heredaría los
   tiempos de la primera y la espera saldría mal en los dos. */
var repetida = T.porTrimestre({
  recaladas: [
    {trimestre:"Q2", nave:"PIGI", cargo:1000, demurrage:100, despatch:0},
    {trimestre:"Q3", nave:"PIGI", cargo:1000, demurrage:200, despatch:0}
  ],
  tiempos: [
    {trimestre:"Q2", nave:"PIGI", esperaAmarre:4, operacionCarga:1, timeAllowed:2},
    {trimestre:"Q3", nave:"PIGI", esperaAmarre:11, operacionCarga:7, timeAllowed:7}
  ]
});
chequear("Q2 toma su propia espera", repetida[0].espera, 4);
chequear("Q3 toma la suya", repetida[1].espera, 11);

/* ---------------------------------------------------------------- */
bloque("Recalada sin tiempos: entra en los montos, no en el promedio");
var parcial = T.porTrimestre({
  recaladas: [
    {trimestre:"Q1", nave:"CON", cargo:1000, demurrage:100, despatch:0},
    {trimestre:"Q1", nave:"SIN", cargo:1000, demurrage:900, despatch:0}
  ],
  tiempos: [{trimestre:"Q1", nave:"CON", esperaAmarre:3, operacionCarga:2, timeAllowed:5}]
});
chequear("las dos suman al demurrage", parcial[0].demurrage, 1000);
chequear("solo una aporta tiempos", parcial[0].conTiempos, 1);
chequear("y la espera es la suya", parcial[0].espera, 3);

/* ---------------------------------------------------------------- */
bloque("Diagnóstico");
var d = T.diagnostico(qs);
chequear("nombra el peor trimestre", d.peorTrimestre.trimestre, "Q2");
chequear("escribe varias frases", d.frases.length >= 3, true);
chequear("dice que la espera manda",
  d.frases.some(function(f){ return f.indexOf("espera previa al amarre") >= 0; }), true);
var vacio = T.diagnostico([]);
chequear("sin datos no inventa conclusiones", vacio.frases.length, 0);

/* ---------------------------------------------------------------- */
bloque("Regresión — temporada 2026 de Punta Totoralillo");
/* Cifras del libro de reportería, leídas con js/reporteria.js. */
var real = T.porTrimestre({
  recaladas: [].concat(
    rep("Q1", 10, 1130084.0, -41561.59, 1789232),
    rep("Q2",  9, 1019161.69, -57370.81, 1472475.18),
    rep("Q3", 14, 4271069.55, -27217.45, 2565368)
  ),
  tiempos: []
});
function rep(q, n, dem, des, cargo){
  // Una fila lleva el total del trimestre y las demás van en cero: lo que se
  // comprueba acá es la suma, no el reparto entre naves.
  var out = [{trimestre:q, nave:q+"-1", cargo:cargo, demurrage:dem, despatch:des}];
  for(var i = 2; i <= n; i++) out.push({trimestre:q, nave:q+"-"+i, cargo:0, demurrage:0, despatch:0});
  return out;
}
chequear("Q1 neto US$ 1.088.522", Math.round(real[0].neto), 1088522);
chequear("Q2 neto US$ 961.791",   Math.round(real[1].neto), 961791);
chequear("Q3 neto US$ 4.243.852", Math.round(real[2].neto), 4243852);
var tr = T.total(real);
chequear("temporada: 33 recaladas", tr.naves, 33);
chequear("demurrage US$ 6.420.315", Math.round(tr.demurrage), 6420315);
chequear("despatch US$ 126.150",    Math.round(tr.despatch), 126150);
chequear("neto US$ 6.294.165",      Math.round(tr.neto), 6294165);
chequear("US$ 1,08 por tonelada",   +tr.usdPorTonelada.toFixed(2), 1.08);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
