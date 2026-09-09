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
chequear("base NOR aceptado usa el otro hito",
  L.inicioLaytime({base:"norAceptado", nor:F("2026-08-14T07:54"),
                   norAceptado:F("2026-08-30T17:36"), turnTime:6}).toISOString(),
  new Date(2026,7,30,23,36).toISOString());
chequear("sin el hito elegido no hay inicio",
  L.inicioLaytime({base:"norAceptado", nor:F("2026-08-14T07:54"), turnTime:6}), null);

/* Datos reales del NOR de la agencia para la CNN-EMB-434. */
chequear("espera NOR presentado → amarre = 16,4 días",
  Math.round(L.diasEntre(F("2026-08-14T07:54"), F("2026-08-30T16:42")) * 10) / 10, 16.4);
chequear("espera NOR aceptado → amarre = 0 (aceptado tras el amarre)",
  L.diasEntre(F("2026-08-30T17:36"), F("2026-08-30T16:42")), 0);

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
bloque("Time sheet — despatch con tarifa propia");
// No todo charter party fija el despatch como porcentaje del demurrage rate:
// algunos le ponen su propio US$/día, y forzarlo a porcentaje obliga a
// calcular la equivalencia a mano fuera de la app.
var baseD = {
  inicio: F("2026-08-30T00:00"), termino: F("2026-09-01T12:00"),   // 60 h, 12 h ahorradas
  modoConteo: "SHINC", deducciones: [], permitido: 72,
  tarifaDemurrage: 30000, aplicaDespatch: true
};
function con(extra){ var o = {}; for(var k in baseD) o[k] = baseD[k]; for(var k2 in extra) o[k2] = extra[k2]; return o; }

var porPct = L.calcularTimeSheet(con({modoDespatch:"porcentaje", porcentajeDespatch:50}));
chequear("rate aplicado = 50 % de 30.000", porPct.tarifaDespatchAplicada, 15000);
chequear("monto por porcentaje", porPct.montoDespatch, 7500);

var porTarifa = L.calcularTimeSheet(con({modoDespatch:"tarifa", tarifaDespatch:12000, porcentajeDespatch:50}));
chequear("la tarifa propia manda sobre el porcentaje", porTarifa.tarifaDespatchAplicada, 12000);
chequear("monto por tarifa propia (12/24 x 12.000)", porTarifa.montoDespatch, 6000);

var sinModo = L.calcularTimeSheet(con({porcentajeDespatch:50}));
chequear("sin modo declarado sigue siendo porcentaje", sinModo.montoDespatch, 7500);

var tarifaCero = L.calcularTimeSheet(con({modoDespatch:"tarifa", tarifaDespatch:0}));
chequear("tarifa propia en cero no cae al porcentaje", tarifaCero.montoDespatch, 0);

var enDemurrage = L.calcularTimeSheet(con({termino: F("2026-09-02T08:00"), modoDespatch:"tarifa", tarifaDespatch:12000}));
chequear("en demurrage el despatch no se paga", enDemurrage.montoDespatch, 0);
chequear("y el demurrage usa su propio rate", enDemurrage.montoDemurrage, 8 / 24 * 30000, 1e-6);

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
bloque("Tasas calculadas — solo cuando el libro no trae el bloque del RTE");
// Reproduce la planilla de la CNN-EMB-434: 202.550 t sobre 131,55 h de eventos.
var t = L.tasasCalculadas({tonelaje: 202550, horasEmbarque: 131.55});
chequear("tasa hora = 1.540 t/h", Math.round(t.tasaHora), 1540);
chequear("tasa día = 36.953 t/día", Math.round(t.tasaDia), 36953);
chequear("divide por eventos, no por el reloj (138,15 h daría 1.466)",
  Math.round(L.tasasCalculadas({tonelaje:202550, horasEmbarque:138.15}).tasaHora), 1466);
var sinHoras = L.tasasCalculadas({tonelaje: 202550, horasEmbarque: 0});
chequear("sin horas no inventa una tasa", sinHoras.tasaHora, null);
chequear("sin tonelaje tampoco", L.tasasCalculadas({tonelaje:0, horasEmbarque:100}).tasaDia, null);

/* ---------------------------------------------------------------- */
bloque("Formato");
chequear("horasAHm", L.horasAHm(30.75), "30h 45m");
chequear("horasADias", L.horasADias(30.75), "1d 06:45");
chequear("horasAHm negativo", L.horasAHm(-1.5), "-1h 30m");
chequear("horasADias redondeo a 24 h", L.horasADias(23.999), "1d 00:00");

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
