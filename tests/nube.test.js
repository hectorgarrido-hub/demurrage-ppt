/**
 * Pruebas de la fusión y el mapeo de la nube.
 * Ejecutar con:  node tests/nube.test.js
 *
 * No se prueba la red: se prueba lo que decide qué dato sobrevive, que es
 * donde un error se traduce en trabajo perdido.
 */
var N = require("../js/nube.js");
var L = require("../js/laytime.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado){
  total++;
  var ok = obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido + (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

function reg(codigo, nave, cuando, extra){
  return {
    id: extra && extra.id ? extra.id : "local-" + codigo,
    campos: {codigo: codigo, nave: nave, primeraEspia: (extra && extra.espia) || "2026-08-30T16:42"},
    deducciones: [{nombre:"Mtto. Mec.", horas: (extra && extra.horas) || 1}],
    actualizadoEn: cuando
  };
}

/* ---------------------------------------------------------------- */
bloque("Mapeo a fila de Supabase");
var fila = N.aFila(reg("CNN-EMB-434", "MN CHINA TRIUMPH", "2026-09-01T10:00:00.000Z"), L);
chequear("código como clave", fila.codigo, "CNN-EMB-434");
chequear("nave", fila.nave, "MN CHINA TRIUMPH");
chequear("fecha en ISO desde la 1ª espía", fila.fecha.slice(0,10), "2026-08-30");
chequear("campos completos", fila.campos.nave, "MN CHINA TRIUMPH");
chequear("conserva la marca de tiempo", fila.actualizado_en, "2026-09-01T10:00:00.000Z");

var volteado = N.deFila(fila);
chequear("vuelta: id derivado del código", volteado.id, "sb:CNN-EMB-434");
chequear("vuelta: campos intactos", volteado.campos.codigo, "CNN-EMB-434");

var sinFecha = N.aFila({campos:{codigo:"X-1"}, deducciones:[]}, L);
chequear("sin hitos, fecha nula", sinFecha.fecha, null);

/* ---------------------------------------------------------------- */
bloque("Fusión local ↔ remoto");
var locales = [reg("A-1", "NAVE UNO", "2026-09-01T10:00:00Z"),
               reg("A-2", "NAVE DOS", "2026-09-01T10:00:00Z")];
var remotos = [reg("A-2", "NAVE DOS corregida", "2026-09-02T10:00:00Z", {id:"sb:A-2"}),
               reg("A-3", "NAVE TRES", "2026-09-01T10:00:00Z", {id:"sb:A-3"})];

var f = N.fusionar(locales, remotos);
chequear("une los tres embarques", f.length, 3);
var porCodigo = {};
f.forEach(function(r){ porCodigo[r.campos.codigo] = r; });
chequear("el remoto más nuevo gana", porCodigo["A-2"].campos.nave, "NAVE DOS corregida");
chequear("pero conserva el id local para no romper la vista", porCodigo["A-2"].id, "local-A-2");
chequear("lo que solo está local se mantiene", porCodigo["A-1"].campos.nave, "NAVE UNO");
chequear("lo que solo está remoto se incorpora", porCodigo["A-3"].campos.nave, "NAVE TRES");

var localMasNuevo = N.fusionar(
  [reg("B-1", "local reciente", "2026-09-05T10:00:00Z")],
  [reg("B-1", "remoto viejo",   "2026-09-01T10:00:00Z")]);
chequear("el local más nuevo no se pisa", localMasNuevo[0].campos.nave, "local reciente");

var sinMarca = N.fusionar(
  [{id:"l", campos:{codigo:"C-1", nave:"sin marca"}, deducciones:[]}],
  [reg("C-1", "remoto con marca", "2026-09-01T10:00:00Z")]);
chequear("sin marca de tiempo local, gana el remoto", sinMarca[0].campos.nave, "remoto con marca");

var sinCodigo = N.fusionar(
  [{id:"l1", campos:{nave:"sin código"}, deducciones:[]}],
  [reg("D-1", "remoto", "2026-09-01T10:00:00Z")]);
chequear("el registro sin código sobrevive", sinCodigo.length, 2);
chequear("y no se emparejó con nada", sinCodigo.filter(function(r){ return !r.campos.codigo; }).length, 1);

chequear("mayúsculas y minúsculas son el mismo embarque",
  N.fusionar([reg("e-1","local","2026-09-01T10:00:00Z")],
             [reg("E-1","remoto","2026-09-02T10:00:00Z")]).length, 1);

chequear("listas vacías no rompen", N.fusionar([], []).length, 0);
chequear("solo remotos", N.fusionar(null, [reg("F-1","r","2026-09-01T10:00:00Z")]).length, 1);

/* ---------------------------------------------------------------- */
bloque("Qué subir tras fusionar");
var remotos2 = [reg("A-2", "remoto nuevo", "2026-09-02T10:00:00Z"),
                reg("A-3", "remoto solo", "2026-09-01T10:00:00Z")];
var fusion2 = N.fusionar([reg("A-1", "solo local", "2026-09-01T10:00:00Z"),
                          reg("A-2", "local viejo", "2026-09-01T10:00:00Z"),
                          reg("A-4", "local nuevo", "2026-09-09T10:00:00Z")], remotos2);
var subir = N.pendientesDeSubir(fusion2, remotos2);
var codigos = subir.map(function(r){ return r.campos.codigo; }).sort().join(",");
chequear("sube lo que la nube no tiene, no lo que allá es más nuevo", codigos, "A-1,A-4");
chequear("no reenvía el que ganó el remoto",
  subir.some(function(r){ return r.campos.codigo === "A-2"; }), false);
chequear("no intenta subir lo que no tiene código",
  N.pendientesDeSubir([{id:"x", campos:{nave:"sin código"}}], []).length, 0);
chequear("con la nube vacía sube todo lo que tenga código",
  N.pendientesDeSubir(fusion2, []).length, 4);

/* ---------------------------------------------------------------- */
bloque("Configuración");
chequear("sin configurar, la nube está apagada", N.activa(), false);
chequear("estado inicial", N.estado(), "off");

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
