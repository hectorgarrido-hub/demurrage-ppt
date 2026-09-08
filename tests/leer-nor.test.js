/**
 * Pruebas del lector de NOR.  Ejecutar con:  node tests/leer-nor.test.js
 *
 * El texto de la primera prueba es literalmente el que pdf.js extrae del NOR
 * de la MN CHINA TRIUMPH, con toda su suciedad: el año "2O26" con letra O, la
 * hora partida "17: 36" y los glifos del sello y la firma.
 */
var N = require("../js/leer-nor.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado){
  total++;
  var ok = obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido + (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

var NOR_REAL = "MESSRS CIA. MINERA DEL PACIFICO S.A.  NOTICE OF READINESS  VESSEL   CHINA TRIUMPH " +
  "VOYAGE N'   :   54 LOADING PORT:   PUNTA TOTORALILLO PORT, CALDERA, CHILE   DATE   :   SEPTEMBER 05, 2026 " +
  "Gentlemen· Please be advised that the vessel under my command has arrived at the port of   " +
  "PUNTA TOTORALILLO PORT, CHILE   , at   07:54   hrs., on   AUGUST 14, 2026   , and Free Pratique was granted " +
  "at   13:30   hrs., on   AUGUST 18, 2026   , being in all _   － －  respect ready to receive a cargo of " +
  "ATACAMA PFCNN & ATACAMA ASF NOTICE OF READINESS TENDERED AT   :   PUNTA TOTORALILLO PORT, " +
  "HR   _ 07:54   /／公亨   DATE   丶託＼＼ AUGUST 14, 2O26 " +
  "NOTICE OF READINESS ACCEPTED AT   :   PUNTA TOTORALILLO PORT, CALDERA, CHILE HR   17: 36   DATE " +
  "For and on behalf of era. AUGUST 30, 2026";

/* ---------------------------------------------------------------- */
bloque("NOR real de la MN CHINA TRIUMPH");
var r = N.desdeTexto(NOR_REAL);
chequear("nave", r.nave, "CHINA TRIUMPH");
chequear("viaje", r.viaje, "54");
chequear("arribo al puerto", r.arribo, "2026-08-14T07:54");
chequear("free pratique", r.freePratique, "2026-08-18T13:30");
chequear("NOR presentado (año con letra O)", r.norPresentado, "2026-08-14T07:54");
chequear("NOR aceptado (hora partida y fecha tras la firma)", r.norAceptado, "2026-08-30T17:36");
chequear("sin reparos", r.avisos.length, 0);

/* ---------------------------------------------------------------- */
bloque("Suciedad de escaneo");
chequear("año 2O26 se corrige", N.primeraFecha("AUGUST 14, 2O26").a, 2026);
chequear("día con letra O", N.primeraFecha("AUGUST O5, 2026").d, 5);
chequear("hora partida 17: 36", N.primeraHora("HR 17: 36 DATE").h, 17);
chequear("hora partida minutos", N.primeraHora("HR 17: 36 DATE").m, 36);
chequear("hora 25:00 se descarta", N.primeraHora("AT 25:00 HRS"), null);
chequear("mes inexistente se descarta", N.primeraFecha("SMARCH 14, 2026"), null);
chequear("año fuera de rango se descarta", N.primeraFecha("AUGUST 14, 1200"), null);
chequear("mes en español", N.primeraFecha("AGOSTO 14, 2026").m, 8);

/* ---------------------------------------------------------------- */
bloque("Parecido de nombres de nave");
chequear("idénticos", N.parecido("CHINA TRIUMPH", "CHINA TRIUMPH"), 1);
chequear("tipeo del RTE se reconoce", N.parecido("CHINA TRIUMPH", "MN CHINA THIUMPH") > 0.9, true);
chequear("naves distintas no", N.parecido("CHINA TRIUMPH", "BULK TIRRENO") < 0.5, true);
chequear("prefijo MN se ignora", N.parecido("CHINA TRIUMPH", "MN CHINA TRIUMPH"), 1);

bloque("Documento que no es un NOR");
var otro = N.desdeTexto("FACTURA ELECTRÓNICA N° 1234 TOTAL 500.000");
chequear("lo detecta", otro.avisos[0].indexOf("no parece un Notice of Readiness") > 0, true);
chequear("no inventa hitos", otro.norPresentado, null);

/* ---------------------------------------------------------------- */
bloque("Fechas incoherentes");
var malo = N.desdeTexto(NOR_REAL.replace("NOTICE OF READINESS ACCEPTED AT   :   PUNTA TOTORALILLO PORT, CALDERA, CHILE HR   17: 36   DATE For and on behalf of era. AUGUST 30, 2026",
                                         "NOTICE OF READINESS ACCEPTED AT : PUNTA TOTORALILLO PORT HR 17:36 DATE AUGUST 02, 2026"));
chequear("lee la fecha alterada", malo.norAceptado, "2026-08-02T17:36");
chequear("avisa que el aceptado es anterior al presentado",
  malo.avisos.some(function(a){ return a.indexOf("NOR aceptado") > 0 && a.indexOf("anterior") > 0; }), true);

bloque("PDF vacío o ilegible");
var vacio = N.desdeTexto("");
chequear("no revienta", vacio.norPresentado, null);
chequear("avisa", vacio.avisos.length > 0, true);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
