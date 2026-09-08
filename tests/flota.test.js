/**
 * Pruebas del consolidado de flota.  Ejecutar con:  node tests/flota.test.js
 */
var F = require("../js/flota.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado, tol){
  total++;
  var ok = typeof esperado === "number"
    ? Math.abs(obtenido - esperado) <= (tol === undefined ? 1e-6 : tol)
    : obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido + (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

/* Recalada base: 80 h de laytime usado contra 72 h permitidas → 8 h de demurrage. */
function recalada(codigo, nave, primeraEspia, extra){
  var campos = {
    nave: nave, codigo: codigo,
    tonelaje: "216000", eslora: "299.9", tarifaMuelle: "1.7",
    nor: "2026-08-29T12:00", primeraEspia: primeraEspia,
    inicioCarga: "2026-08-30T00:00", finCarga: "2026-09-02T08:00",
    ultimaEspia: "2026-09-02T12:00",
    baseInicio: "amarre", turnTime: "6", baseTermino: "finCarga",
    modoPermitido: "tasa", tasaDia: "72000", horasFijas: "72",
    modoConteo: "SHINC", tarifaDemurrage: "30000", porcentajeDespatch: "50",
    aplicaDespatch: true, festivos: "",
    horasTotales: "131.55", horasOpEfectiva: "85.30",
    horasMantenimientoMuellaje: "30.8", horasGira: "0"
  };
  for(var k in (extra || {})) campos[k] = extra[k];
  return {
    campos: campos,
    deducciones: [
      {nombre:"Mtto. Mec.", lado:"puerto", horas:1.15, descuenta:false, mantenimiento:true},
      {nombre:"Cambio turno IMOPAC", lado:"puerto", horas:11, descuenta:false, mantenimiento:false},
      {nombre:"Eventos climáticos", lado:"clima", horas:2, descuenta:true, mantenimiento:false},
      {nombre:"Preparativo maniobra corrida nave", lado:"nave", horas:8.0167, descuenta:true, mantenimiento:false}
    ]
  };
}

/* ---------------------------------------------------------------- */
bloque("Alta de recaladas");
var lista = [];
lista = F.agregar(lista, recalada("CNN-EMB-434", "MN CHINA TRIUMPH", "2026-08-30T00:00"));
chequear("primera recalada", lista.length, 1);
chequear("recibe id", typeof lista[0].id, "string");

lista = F.agregar(lista, recalada("CNN-EMB-435", "MN PIGI", "2026-08-25T00:00"));
chequear("segunda recalada", lista.length, 2);
chequear("orden cronológico por 1ª espía", lista[0].campos.nave, "MN PIGI");

var idPrevio = lista[1].id;
lista = F.agregar(lista, recalada("CNN-EMB-434", "MN CHINA TRIUMPH (corregida)", "2026-08-30T00:00"));
chequear("reimportar no duplica", lista.length, 2);
chequear("conserva el id al actualizar", lista[1].id, idPrevio);
chequear("actualiza el contenido", lista[1].campos.nave, "MN CHINA TRIUMPH (corregida)");

lista = F.agregar(lista, recalada("", "SIN CÓDIGO", "2026-09-10T00:00"));
chequear("sin código se agrega igual", lista.length, 3);

/* ---------------------------------------------------------------- */
bloque("Cálculo por recalada");
var r = F.calcular(recalada("CNN-EMB-434", "MN CHINA TRIUMPH", "2026-08-30T00:00"));
chequear("nave", r.nave, "MN CHINA TRIUMPH");
chequear("allowed 72 h (216.000 t a 72.000 t/día)", r.permitido, 72);
chequear("transcurrido 80 h", r.ts.horasTranscurridas, 80);
chequear("deduce clima y nave", r.ts.horasDeducidas, 10.0167, 1e-9);
chequear("usado 69,98 h", r.ts.horasUsadas, 69.9833, 1e-4);
chequear("queda en despatch", r.ts.esDemurrage, false);
chequear("despatch = 2,0167 h al 50 % de 30.000", r.ts.montoDespatch, 2.0167/24*30000*0.5, 1e-3);
chequear("muellaje sobre NWH (84 h − 30,8)", r.muellaje.nwh, 53.2, 1e-9);
chequear("controlable", r.controlable, 12.15, 1e-9);
chequear("no controlable", r.noControlable, 10.0167, 1e-9);
chequear("DF encadenado", r.indices.df, (131.55-1.15)/131.55*100, 1e-9);

bloque("Recalada incompleta");
var incompleta = F.calcular(recalada("CNN-EMB-999", "SIN HITOS", "2026-08-30T00:00", {primeraEspia:"", finCarga:""}));
chequear("sin hitos no hay time sheet", incompleta.ts, null);
chequear("pero sí índices", incompleta.indices.df > 0, true);

/* ---------------------------------------------------------------- */
bloque("Consolidado de temporada");
/* Mismos hitos (80 h de transcurrido, 69,98 h de laytime usado) y distinta
   tasa de embarque, para que cada una caiga de un lado distinto. */
var flota = [
  recalada("A-1", "NAVE UNO",  "2026-08-30T00:00"),                       // allowed 72 h  → despatch
  recalada("A-2", "NAVE DOS",  "2026-08-30T00:00", {tasaDia:"36000"}),    // allowed 144 h → despatch
  recalada("A-3", "NAVE TRES", "2026-08-30T00:00", {tasaDia:"144000"})    // allowed 36 h  → demurrage
].map(F.calcular);

var t = F.agregado(flota);
chequear("recaladas", t.recaladas, 3);
chequear("tonelaje total", t.tonelaje, 648000);
chequear("una en demurrage", t.conDemurrage, 1);
chequear("dos en despatch", t.conDespatch, 2);
chequear("neto = demurrage − despatch", t.neto, t.demurrage - t.despatch, 1e-9);
chequear("detenciones totales", t.detenciones, 3 * (12.15 + 10.0167), 1e-9);
chequear("% controlable", t.pctControlable, 12.15/(12.15+10.0167)*100, 1e-9);
chequear("causas consolidadas", t.listaCausas.length, 4);
chequear("causa mayor es cambio de turno", t.listaCausas[0].nombre, "Cambio turno IMOPAC");
chequear("suma las 3 recaladas", t.listaCausas[0].horas, 33, 1e-9);
chequear("cuenta en cuántas recaladas aparece", t.listaCausas[0].recaladas, 3);

bloque("Baja");
var menos = F.eliminar(flota.map(function(x,i){ return {id:"id"+i, campos:{}, deducciones:[]}; }), "id1");
chequear("elimina por id", menos.length, 2);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
