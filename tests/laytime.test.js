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
/* «Inicia tras expiración de Turn Time o al inicio de Operaciones, según lo
   primero que ocurra» — redacción del charter party de CMP. */
chequear("lo primero: manda el turn time si la nave espera",
  L.inicioLaytime({base:"loPrimero", nor:F("2026-08-14T07:54"), turnTime:12,
                   inicioOperaciones:F("2026-08-30T19:21")}).toISOString(),
  new Date(2026,7,14,19,54).toISOString());
chequear("lo primero: manda la operación si empieza antes",
  L.inicioLaytime({base:"loPrimero", nor:F("2026-08-14T07:54"), turnTime:12,
                   inicioOperaciones:F("2026-08-14T10:00")}).toISOString(),
  new Date(2026,7,14,10,0).toISOString());
chequear("lo primero sin operaciones cae al turn time",
  L.inicioLaytime({base:"loPrimero", nor:F("2026-08-14T07:54"), turnTime:12}).toISOString(),
  new Date(2026,7,14,19,54).toISOString());

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
bloque("Regresión: Laytime Statement real de la M/V CHINA TRIUMPH");
/* Documento del área comercial (lámina 12 de «Shipping y Laytime Sep 2026»).
   Es la liquidación que efectivamente se le cobró al armador, así que sirve de
   patrón: si el motor deja de reproducirla, algo se rompió.

       Cargo 200.894 MT a 30.000 MT/día      -> allowed 6,6965 d (6d 16h 43m)
       NOR aceptado 14-ago 07:54, turn time 12 -> cuenta desde 14-ago 19:54 (A)
       Completed Laytime 5-sep 14:15 (B)     -> contado 21,7646 d (21d 18h 21m)
       LESS NOT TO COUNT                     -> 17h 17m
       Net time used                         -> 21,0444 d (21d 1h 4m)
       DEMURRAGE a US$ 41.906/día            -> US$ 601.263,94                */
var ct = {
  inicio: F("2026-08-14T19:54"),
  termino: F("2026-09-05T14:15"),
  modoConteo: "SHINC",
  permitido: L.laytimePermitido({modo:"tasa", tonelaje:200894, tasaDia:30000}),
  tarifaDemurrage: 41906,
  deducciones: [
    {nombre:"Shifting to berth",   horas:201/60, descuenta:true},
    {nombre:"Initial draft survey",horas: 60/60, descuenta:true},
    {nombre:"Strong wind",         horas:275/60, descuenta:true},
    {nombre:"Warping",             horas: 42/60, descuenta:true},
    {nombre:"Strong wind",         horas:121/60, descuenta:true},
    {nombre:"Warping",             horas: 36/60, descuenta:true},
    {nombre:"Warping",             horas: 42/60, descuenta:true},
    {nombre:"Draft survey",        horas: 75/60, descuenta:true},
    {nombre:"Draft survey",        horas: 35/60, descuenta:true},
    {nombre:"Warping",             horas: 36/60, descuenta:true},
    {nombre:"Warping",             horas: 36/60, descuenta:true},
    {nombre:"Draft survey",        horas: 38/60, descuenta:true},
    {nombre:"Final draft survey",  horas: 40/60, descuenta:true}
  ]
};
chequear("el turn time de 12 h fija el inicio del cómputo en 14-ago 19:54",
  L.inicioLaytime({base:"loPrimero", nor:F("2026-08-14T07:54"), turnTime:12,
                   inicioOperaciones:F("2026-08-30T19:21")}).toISOString(),
  ct.inicio.toISOString());
chequear("allowed 6,6965 días", ct.permitido / 24, 6.6965, 5e-5);
var cts = L.calcularTimeSheet(ct);
chequear("contado 21,7646 días", cts.horasTranscurridas / 24, 21.7646, 5e-5);
chequear("less not to count 17h 17m", cts.horasDeducidas, 17 + 17/60, 1e-9);
chequear("net time used 21,0444 días", cts.horasUsadas / 24, 21.0444, 5e-5);
chequear("hay demurrage, no despatch", cts.esDemurrage, true);
// Misma diferencia de 0,0000614 d que explica los US$ 2,56 de más abajo.
chequear("time lost 14,3479 días", cts.horasDemurrage / 24, 14.34792, 1e-4);
/* La planilla del statement expresa el allowed en días/horas/minutos enteros
   (6d 16h 43m = 6,696528 d) y multiplica sobre ese valor redondeado; el motor
   usa 200.894/30.000 = 6,696467 d sin redondear. Son 0,0000614 días de
   diferencia: US$ 2,56 sobre US$ 601 mil. No se redondea a propósito —
   inventar un redondeo para calzar un documento es peor que explicar la
   diferencia— pero la tolerancia deja constancia de cuánto vale. */
chequear("demurrage US$ 601.263,94 del statement (± el redondeo a minutos)",
  cts.montoDemurrage, 601263.94, 3);

/* ---------------------------------------------------------------- */
bloque("Hitos que se contradicen");
/* El CNN-EMB no trae ETA, arribo ni NOR: esos cuatro campos vienen del PDF
   de la agencia o de la mano, y sobreviven a un cambio de nave si nadie los
   borra. Así apareció una recalada de la PIGI con el arribo y el NOR
   aceptado de la CHINA TRIUMPH, y el aceptado dos días ANTES del
   presentado. */
chequear("sin hitos no hay contradicción", L.hitosIncoherentes({}).length, 0);
chequear("sin argumento tampoco", L.hitosIncoherentes(null).length, 0);
var coherente = {
  eta: F("2026-08-28T08:00"), arribo: F("2026-08-30T10:00"),
  nor: F("2026-08-30T11:00"), norAceptado: F("2026-08-30T17:36"),
  primeraEspia: F("2026-08-30T16:42"), inicioCarga: F("2026-08-30T19:21"),
  finCarga: F("2026-09-05T13:30")
};
chequear("una recalada consistente no reclama", L.hitosIncoherentes(coherente).length, 0);

var alReves = {nor: F("2026-09-01T00:01"), norAceptado: F("2026-08-30T17:36")};
chequear("un NOR aceptado antes de presentarse se denuncia",
  L.hitosIncoherentes(alReves).length, 1);
chequear("y lo dice con las palabras del muelle",
  /El NOR aceptado es anterior al NOR presentado/.test(L.hitosIncoherentes(alReves)[0]), true);

chequear("carguío que termina antes de empezar",
  L.hitosIncoherentes({inicioCarga: F("2026-09-05T13:30"), finCarga: F("2026-09-01T10:00")}).length, 1);
chequear("amarre anterior al arribo",
  L.hitosIncoherentes({arribo: F("2026-08-30T10:00"), primeraEspia: F("2026-08-29T10:00")}).length, 1);
/* Llegar antes del ETA es lo normal, no un dato imposible: el ETA se nomina
   con semanas de anticipación. El desfase se informa en su propia ficha. */
chequear("llegar antes del ETA no es contradicción",
  L.hitosIncoherentes({eta: F("2026-08-30T08:00"), arribo: F("2026-08-28T08:00")}).length, 0);
/* Un hito a medias no inventa contradicciones con los que faltan. */
chequear("con un solo hito no hay nada que comparar",
  L.hitosIncoherentes({norAceptado: F("2026-08-30T17:36")}).length, 0);
/* Se acumulan: una recalada con dos campos pegados de otra nave reclama dos
   veces, no una. */
var dosMales = {arribo: F("2026-08-14T07:54"), nor: F("2026-09-01T00:01"),
                norAceptado: F("2026-08-30T17:36"), primeraEspia: F("2026-08-13T10:00")};
chequear("dos contradicciones se cuentan las dos", L.hitosIncoherentes(dosMales).length, 2);
/* Acepta cadenas, que es como vienen de los campos del formulario. */
chequear("lee también cadenas del formulario",
  L.hitosIncoherentes({nor:"2026-09-01T00:01", norAceptado:"2026-08-30T17:36"}).length, 1);

/* ---------------------------------------------------------------- */
bloque("Formato");
chequear("horasAHm", L.horasAHm(30.75), "30h 45m");
chequear("horasADias", L.horasADias(30.75), "1d 06:45");
chequear("horasAHm negativo", L.horasAHm(-1.5), "-1h 30m");
chequear("horasADias redondeo a 24 h", L.horasADias(23.999), "1d 00:00");

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
