/**
 * Pruebas del motor de laytime.  Ejecutar con:  node tests/laytime.test.js
 * Sin dependencias externas: salida PASS/FALLA y código de salida != 0 si algo falla.
 */
var L = require("../js/laytime.js");

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
var F = L.parseFechaHora;

/* ---------------------------------------------------------------- */
bloque("Fechas y duraciones");
chequear("parseFechaHora válida", L.aIso(F("2026-08-30T16:42")), "2026-08-30");
chequear("parseFechaHora inválida", F("30-08-2026 16:42"), null);
chequear("parseFechaHora acepta espacio", L.aIso(F("2026-08-30 16:42")), "2026-08-30");
chequear("horasEntre 144,3 h", L.horasEntre(F("2026-08-30T16:42"), F("2026-09-05T17:00")), 144.3, 1e-9);
chequear("horasEntre orden inverso = 0", L.horasEntre(F("2026-09-05T17:00"), F("2026-08-30T16:42")), 0);

/* ---------------------------------------------------------------- */
bloque("Régimen de conteo");
// 2026-08-30 es domingo; 2026-09-06 es domingo.
chequear("SHINC no excluye nada",
  L.horasExcluidasCalendario(F("2026-08-30T00:00"), F("2026-09-05T00:00"), "SHINC", {}), 0);
chequear("SHEX excluye el domingo completo",
  L.horasExcluidasCalendario(F("2026-08-30T00:00"), F("2026-09-05T00:00"), "SHEX", {}), 24);
chequear("SHEX recorta el domingo parcial",
  L.horasExcluidasCalendario(F("2026-08-30T18:00"), F("2026-08-31T06:00"), "SHEX", {}), 6);
chequear("SHEX suma festivo (18-09)",
  L.horasExcluidasCalendario(F("2026-09-17T00:00"), F("2026-09-19T00:00"), "SHEX", {"2026-09-18":true}), 24);
chequear("SATSHEX excluye sábado desde 12:00",
  L.horasExcluidasCalendario(F("2026-09-05T00:00"), F("2026-09-06T00:00"), "SATSHEX", {}), 12);

/* ---------------------------------------------------------------- */
bloque("Laytime permitido");
chequear("modo horas fijas", L.laytimePermitido({modo:"horas", horasFijas:72}), 72);
chequear("modo tasa: 120.000 t a 40.000 t/día = 72 h",
  L.laytimePermitido({modo:"tasa", tonelaje:120000, tasaDia:40000}), 72);
chequear("modo tasa sin tasa = 0", L.laytimePermitido({modo:"tasa", tonelaje:120000, tasaDia:0}), 0);

/* ---------------------------------------------------------------- */
bloque("Inicio del laytime");
chequear("NOR + 6 h de turn time",
  L.inicioLaytime({base:"nor", nor:F("2026-08-30T10:00"), turnTime:6}).toISOString(),
  new Date(2026,7,30,16,0).toISOString());
chequear("base amarre ignora turn time",
  L.inicioLaytime({base:"amarre", primeraEspia:F("2026-08-30T16:42"), turnTime:6}).toISOString(),
  new Date(2026,7,30,16,42).toISOString());

/* ---------------------------------------------------------------- */
bloque("Time sheet — demurrage");
var demurrage = L.calcularTimeSheet({
  inicio: F("2026-08-30T00:00"), termino: F("2026-09-02T08:00"),   // 80 h
  modoConteo: "SHINC", deducciones: [], permitido: 72,
  tarifaDemurrage: 25000, aplicaDespatch: true, porcentajeDespatch: 50
});
chequear("horas usadas", demurrage.horasUsadas, 80);
chequear("balance negativo", demurrage.balance, -8);
chequear("es demurrage", demurrage.esDemurrage, true);
chequear("horas en demurrage", demurrage.horasDemurrage, 8);
chequear("monto demurrage (8/24 x 25.000)", demurrage.montoDemurrage, 8333.333333, 1e-5);
chequear("utilización 111,1 %", demurrage.utilizacion, 111.111111, 1e-5);

/* ---------------------------------------------------------------- */
bloque("Time sheet — despatch");
var despatch = L.calcularTimeSheet({
  inicio: F("2026-08-30T00:00"), termino: F("2026-09-01T12:00"),   // 60 h
  modoConteo: "SHINC", deducciones: [], permitido: 72,
  tarifaDemurrage: 25000, aplicaDespatch: true, porcentajeDespatch: 50
});
chequear("balance positivo", despatch.balance, 12);
chequear("no es demurrage", despatch.esDemurrage, false);
chequear("monto despatch (12/24 x 25.000 x 50 %)", despatch.montoDespatch, 6250);
var sinDespatch = L.calcularTimeSheet({
  inicio: F("2026-08-30T00:00"), termino: F("2026-09-01T12:00"),
  modoConteo: "SHINC", deducciones: [], permitido: 72,
  tarifaDemurrage: 25000, aplicaDespatch: false
});
chequear("sin cláusula de despatch, monto 0", sinDespatch.montoDespatch, 0);

/* ---------------------------------------------------------------- */
bloque("Time sheet — deducciones y excepciones");
var conDeducciones = L.calcularTimeSheet({
  inicio: F("2026-08-30T00:00"), termino: F("2026-09-02T08:00"),   // 80 h
  modoConteo: "SHINC",
  deducciones: [
    {nombre:"Eventos climáticos", horas:6.31, descuenta:true},
    {nombre:"Mtto. mecánico",     horas:1.15, descuenta:true},
    {nombre:"Cambio de bodega",   horas:7.57, descuenta:false}   // no descuenta: corre contra el fletador
  ],
  permitido: 72, tarifaDemurrage: 25000, aplicaDespatch: true, porcentajeDespatch: 50
});
chequear("solo descuenta lo marcado", conDeducciones.horasDeducidas, 7.46, 1e-9);
chequear("horas usadas netas", conDeducciones.horasUsadas, 72.54, 1e-9);
chequear("demurrage residual", conDeducciones.horasDemurrage, 0.54, 1e-9);

var recortado = L.calcularTimeSheet({
  inicio: F("2026-08-30T00:00"), termino: F("2026-08-30T10:00"),   // 10 h
  modoConteo: "SHINC",
  deducciones: [{nombre:"Fuerza mayor", horas:99, descuenta:true}],
  permitido: 72, tarifaDemurrage: 25000, aplicaDespatch: false
});
chequear("las deducciones no dejan tiempo negativo", recortado.horasUsadas, 0);
chequear("deducción recortada al tiempo real", recortado.horasDeducidas, 10);

var conSHEX = L.calcularTimeSheet({
  inicio: F("2026-08-29T00:00"), termino: F("2026-08-31T00:00"),   // 48 h, incluye domingo 30
  modoConteo: "SHEX", festivos: {},
  deducciones: [], permitido: 72, tarifaDemurrage: 25000, aplicaDespatch: false
});
chequear("SHEX descuenta el domingo del tiempo usado", conSHEX.horasUsadas, 24);

/* ---------------------------------------------------------------- */
bloque("Muellaje — datos reales CNN-EMB-434 / MN CHINA TRIUMPH");
var m = L.calcularMuellaje({
  primeraEspia: F("2026-08-30T16:42"), ultimaEspia: F("2026-09-05T17:00"),
  horasMantenimiento: 30.8, horasGira: 0, eslora: 299.9, tarifa: 1.7
});
chequear("tiempo de muellaje 144,3 h", m.horasMuellaje, 144.3, 1e-9);
chequear("NWH 113,5 h", m.nwh, 113.5, 1e-9);
chequear("muellaje USD 57.865,705", m.monto, 57865.705, 1e-3);

/* ---------------------------------------------------------------- */
bloque("Índices operacionales — CNN-EMB-434 (valores de RESUMEN_TIEMPOS)");
var i = L.indices({
  horasTotales: 131.55,
  horasMantenimiento: 1.15 + 34/60,        // Mtto. Mec. + Mtto. Eléctr.
  horasReserva: 8 + 1/60,                  // Preparativo maniobra corrida nave
  horasOperacionEfectiva: 85.3
});
chequear("horas disponibles", i.disponibles, 129.8333, 0.001);
chequear("horas operativas",  i.operativas,  121.8167, 0.001);
chequear("DF = 98,695 %",  i.df, 98.695,  0.001);
chequear("U  = 93,8254 %", i.u,  93.8254, 0.001);
chequear("FO = 70,0233 %", i.fo, 70.0233, 0.001);
var iVacio = L.indices({horasTotales: 0});
chequear("sin horas totales, índices en 0", iVacio.df, 0);

/* ---------------------------------------------------------------- */
bloque("Formato");
chequear("horasAHm", L.horasAHm(30.75), "30h 45m");
chequear("horasADias", L.horasADias(30.75), "1d 06:45");
chequear("horasAHm negativo", L.horasAHm(-1.5), "-1h 30m");
chequear("horasADias redondeo a 24 h", L.horasADias(23.999), "1d 00:00");

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
