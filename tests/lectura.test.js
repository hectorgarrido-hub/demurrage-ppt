/**
 * Pruebas del semáforo y la lectura.  Ejecutar con:  node tests/lectura.test.js
 * Los datos son los de la CNN-EMB-434 con los hitos reales del NOR.
 */
var LEC = require("../js/lectura.js");
var L = require("../js/laytime.js");

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
var F = L.parseFechaHora;

/* Recalada real: laytime desde el NOR presentado, 30.000 US$/día. */
var ts = L.calcularTimeSheet({
  inicio: F("2026-08-14T13:54"), termino: F("2026-09-05T13:30"),
  modoConteo: "SHINC", festivos: {},
  deducciones: [{nombre:"Preparativo maniobra corrida nave", lado:"nave", horas:8.0167, descuenta:true}],
  permitido: 202550 / 30000 * 24, tarifaDemurrage: 30000,
  aplicaDespatch: true, porcentajeDespatch: 50
});

var datos = {
  nave: "MN CHINA TRIUMPH", ts: ts,
  controlable: 38.25, noControlable: 8.0167,
  esperaDias: L.diasEntre(F("2026-08-14T07:54"), F("2026-08-30T16:42")),
  causaMayor: {nombre:"Cambio turno IMOPAC", horas:11},
  tasaDia: 36953, tasaPactada: 30000, muellaje: 57865.7,
  norAceptadoTexto: "30 ago 2026 17:36"
};

/* ---------------------------------------------------------------- */
bloque("Semáforo");
var e = LEC.estado(datos);
chequear("recalada con demurrage y espera larga → crítico", e.nivel, "critico");
chequear("título", e.titulo, "Recalada con costo");
chequear("enumera los motivos", e.motivos.length >= 3, true);
chequear("nombra el exceso de laytime", e.motivos[0].indexOf("excedió el laytime") > 0, true);

var limpia = LEC.estado({ts:{esDemurrage:false, montoDespatch:5000, utilizacion:60},
                         controlable:2, noControlable:8, esperaDias:0.5});
chequear("sin demurrage, poca espera y bajo control → ok", limpia.nivel, "ok");
chequear("título limpio", limpia.titulo, "Recalada limpia");
chequear("sin motivos", limpia.motivos.length, 0);

var media = LEC.estado({ts:{esDemurrage:false, montoDespatch:100, utilizacion:60},
                        controlable:9, noControlable:1, esperaDias:0});
chequear("solo control alto → atención", media.nivel, "atencion");

var espera = LEC.estado({ts:{esDemurrage:false, utilizacion:10}, controlable:0, noControlable:1, esperaDias:4});
chequear("espera de 4 días → atención", espera.nivel, "atencion");
var esperaLarga = LEC.estado({ts:{esDemurrage:false, utilizacion:10}, controlable:0, noControlable:1, esperaDias:9});
chequear("espera de 9 días → crítico", esperaLarga.nivel, "critico");

/* ---------------------------------------------------------------- */
bloque("Lectura en prosa");
var p = LEC.parrafos(datos);
chequear("cuatro o más frases", p.length >= 4, true);
chequear("abre con el monto del demurrage", p[0].indexOf("de demurrage") > 0, true);
chequear("nombra la nave", p[0].indexOf("MN CHINA TRIUMPH"), 0);
chequear("menciona la espera", p.some(function(f){ return f.indexOf("Esperó") === 0; }), true);
chequear("menciona la causa mayor sin romper la sigla",
  p.some(function(f){ return f.indexOf("Cambio turno IMOPAC") > 0; }), true);
chequear("compara la tasa con la pactada", p.some(function(f){ return f.indexOf("t/día") > 0; }), true);
chequear("cierra con el muellaje", p[p.length-1].indexOf("muellaje") > 0, true);

var pDespatch = LEC.parrafos({nave:"MN PIGI", ts:{esDemurrage:false, montoDespatch:6250,
  horasUsadas:60, permitido:72, utilizacion:83}});
chequear("caso despatch se redacta distinto", pDespatch[0].indexOf("despatch a favor") > 0, true);

/* ---------------------------------------------------------------- */
bloque("Cascada en dinero");
var c = LEC.cascadaDinero(ts, 30000);
chequear("los mismos pasos que la cascada de horas", c.length, 3);
chequear("arranca en el tiempo transcurrido", c[0].nombre, "Tiempo transcurrido");
chequear("valoriza a 1.250 US$/hora", c[0].valor, ts.horasTranscurridas * 1250, 1e-6);
chequear("descuenta las deducciones", c[1].valor, ts.horasDeducidas * 1250, 1e-6);
chequear("cierra en el laytime usado", c[2].nombre, "Laytime usado");
chequear("y lo valoriza al mismo rate", c[2].valor, ts.horasUsadas * 1250, 1e-6);
/* La cadena tiene que cuadrar: transcurrido − régimen − deducciones = usado. */
chequear("la cascada cuadra",
  Math.round(c[0].valor - c[1].valor), Math.round(ts.horasUsadas * 1250));

/* El permitido salió de los pasos a propósito y va como línea de referencia.
   Restándolo, una recalada dentro del allowed —o sea casi cualquiera buena—
   dejaba el acumulado en negativo y la barra se dibujaba hacia la izquierda,
   encima de las etiquetas. */
var dentro = LEC.cascadaDinero({
  horasTranscurridas:140.80, horasExcluidas:0, horasDeducidas:8.31, horasUsadas:132.49,
  permitido:162.04, esDemurrage:false, montoDespatch:18468.75
}, 30000);
var acumulado = 0;
dentro.forEach(function(p){
  if(p.tipo === "base") acumulado = p.valor;
  else if(p.tipo === "resta") acumulado -= p.valor;
});
chequear("el acumulado nunca queda negativo", acumulado > 0, true);
chequear("ningún paso resta el permitido",
  dentro.filter(function(p){ return p.nombre.indexOf("permitido") >= 0; }).length, 0);

var conRegimen = LEC.cascadaDinero({
  horasTranscurridas:100, horasExcluidas:24, horasDeducidas:6, horasUsadas:70,
  permitido:72, esDemurrage:false
}, 24000);
chequear("con régimen SHEX aparece su paso", conRegimen.length, 4);
chequear("y cuadra igual",
  Math.round(conRegimen[0].valor - conRegimen[1].valor - conRegimen[2].valor),
  Math.round(70 * 1000));

chequear("sin tarifa no hay cascada", LEC.cascadaDinero(ts, 0).length, 0);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
