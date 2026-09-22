/**
 * Pruebas de la bitácora del puerto.  node tests/bitacora.test.js
 */
var B = require("../js/bitacora.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado, tol){
  total++;
  var ok = (typeof esperado === "number")
    ? Math.abs(obtenido - esperado) <= (tol === undefined ? 1e-9 : tol)
    : obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido +
    (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

/* ---------------------------------------------------------------- */
bloque("Fechas sin corrimiento de zona");
/* El 20 de septiembre a las 21:00 en Chile ya es el 21 en UTC. Usar
   toISOString para el día del evento dejaba el cierre registrado un día
   después del que la persona marcó en el calendario. */
chequear("una tarde chilena sigue siendo su día",
  B.aIso(new Date(2026, 8, 20, 21, 30)), "2026-09-20");
chequear("la medianoche también", B.aIso(new Date(2026, 8, 20, 0, 0)), "2026-09-20");
chequear("ida y vuelta", B.aIso(B.deIso("2026-01-05")), "2026-01-05");
chequear("basura no inventa fecha", B.deIso("ayer"), null);
chequear("ni una fecha inválida da ISO", B.aIso(new Date("x")), "");
chequear("un día dura un día", B.largoEnDias("2026-09-20", "2026-09-20"), 1);
chequear("ayer y hoy son dos", B.largoEnDias("2026-09-21", "2026-09-22"), 2);

/* ---------------------------------------------------------------- */
bloque("Normalizar un evento");
var ev = B.normalizar({desde:"2026-09-22", hasta:"2026-09-21", estado:"cerrado",
                       causa:"  Paro o movilización portuaria  ", nota:"personal ajeno a la empresa"},
                      Date.parse("2026-09-22T12:00:00Z"));
/* Arrastrar hacia atrás en el calendario es un gesto normal, no un error. */
chequear("el rango al revés se da vuelta: desde", ev.desde, "2026-09-21");
chequear("y hasta", ev.hasta, "2026-09-22");
chequear("la causa va sin espacios", ev.causa, "Paro o movilización portuaria");
chequear("sin hasta, un solo día",
  B.normalizar({desde:"2026-09-22", estado:"cerrado"}).hasta, "2026-09-22");
chequear("un estado desconocido cae en cerrado",
  B.normalizar({desde:"2026-09-22", estado:"nublado"}).estado, "cerrado");
chequear("sin desde no hay evento", B.normalizar({estado:"cerrado"}), null);
chequear("dos eventos seguidos no comparten id",
  B.normalizar({desde:"2026-09-22"}).id === B.normalizar({desde:"2026-09-22"}).id, false);

/* ---------------------------------------------------------------- */
bloque("Qué impide guardar");
chequear("sin causa no se guarda",
  B.validar({desde:"2026-09-22", hasta:"2026-09-22", estado:"cerrado", causa:""}).length, 1);
chequear("y lo dice por qué",
  /se va a citar al liquidar/.test(B.validar({desde:"2026-09-22", estado:"cerrado", causa:""})[0]), true);
chequear("con causa y estado, sin reparos",
  B.validar({desde:"2026-09-22", hasta:"2026-09-22", estado:"cerrado", causa:"Viento"}).length, 0);
/* Un rango larguísimo casi siempre es un clic mal arrastrado. */
chequear("un rango de más de 60 días se reclama",
  B.validar({desde:"2026-01-01", hasta:"2026-06-01", estado:"cerrado", causa:"Viento"}).length, 1);
chequear("sin fecha se reclama una sola cosa",
  B.validar({estado:"cerrado", causa:"Viento"}).length, 1);

/* ---------------------------------------------------------------- */
bloque("Días que cubre");
var paro = B.normalizar({desde:"2026-09-21", hasta:"2026-09-22", estado:"cerrado",
                         causa:"Paro o movilización portuaria"});
chequear("ayer y hoy", B.dias(paro).length, 2);
chequear("el primero", B.dias(paro)[0], "2026-09-21");
chequear("el último", B.dias(paro)[1], "2026-09-22");
chequear("un rango dado vuelta a mano no cubre nada",
  B.dias({desde:"2026-09-22", hasta:"2026-09-21"}).length, 0);

/* ---------------------------------------------------------------- */
bloque("Cuando dos eventos caen el mismo día");
/* Se pueden registrar los dos —son causas distintas y las dos se citan— pero
   el calendario pinta uno, y tiene que ser el más grave. */
var viento = B.normalizar({desde:"2026-09-22", hasta:"2026-09-22", estado:"restringido", causa:"Viento"});
var mapa = B.porDia([viento, paro]);
chequear("manda el más grave", mapa["2026-09-22"].estado, "cerrado");
chequear("el día que solo tiene uno lleva ese", mapa["2026-09-21"].estado, "cerrado");
chequear("el orden de la lista no cambia el resultado",
  B.porDia([paro, viento])["2026-09-22"].estado, "cerrado");
chequear("un día sin eventos no aparece", mapa["2026-09-23"], undefined);
chequear("delDia devuelve los dos", B.delDia([viento, paro], "2026-09-22").length, 2);
chequear("y el más grave primero", B.delDia([viento, paro], "2026-09-22")[0].estado, "cerrado");

/* ---------------------------------------------------------------- */
bloque("La colección");
var lista = B.agregar(B.agregar([], paro), viento);
chequear("dos eventos", lista.length, 2);
chequear("el más reciente primero", lista[0].desde, "2026-09-22");
/* Guardar dos veces el mismo evento lo reemplaza, no lo duplica: editar y
   volver a guardar es lo normal. */
var editado = Object.assign({}, paro, {nota:"corregido"});
chequear("reguardar no duplica", B.agregar(lista, editado).length, 2);
chequear("y deja la versión nueva",
  B.agregar(lista, editado).filter(function(x){ return x.id === paro.id; })[0].nota, "corregido");
chequear("eliminar saca uno", B.eliminar(lista, paro.id).length, 1);
chequear("eliminar un id que no está no rompe", B.eliminar(lista, "nada").length, 2);

/* ---------------------------------------------------------------- */
bloque("Tres personas registrando a la vez");
/* Reemplazar la lista entera por la de la nube —«gana el último que
   guardó»— haría desaparecer el evento del otro sin que nadie se entere.
   Se une por id y por marca de tiempo. */
var mio = B.normalizar({id:"a", desde:"2026-09-22", estado:"cerrado", causa:"Paro",
                        actualizadoEn:"2026-09-22T10:00:00.000Z"});
var suyo = B.normalizar({id:"b", desde:"2026-09-23", estado:"restringido", causa:"Viento",
                         actualizadoEn:"2026-09-23T10:00:00.000Z"});
var mioViejo = B.normalizar({id:"a", desde:"2026-09-22", estado:"restringido", causa:"Paro",
                             actualizadoEn:"2026-09-22T08:00:00.000Z"});
var unido = B.fusionar([mio], [suyo, mioViejo]);
chequear("no se pierde el evento del otro", unido.length, 2);
chequear("y el mío más nuevo le gana al de la nube",
  unido.filter(function(x){ return x.id === "a"; })[0].estado, "cerrado");
var masNuevoAlla = B.normalizar({id:"a", desde:"2026-09-22", estado:"abierto", causa:"Paro",
                                 actualizadoEn:"2026-09-25T10:00:00.000Z"});
chequear("pero si el de la nube es más nuevo, gana ese",
  B.fusionar([mio], [masNuevoAlla]).filter(function(x){ return x.id === "a"; })[0].estado, "abierto");
chequear("sube lo que la nube no tiene", B.pendientesDeSubir([mio, suyo], [suyo]).length, 1);
chequear("y lo que allá está más viejo", B.pendientesDeSubir([mio], [mioViejo]).length, 1);
chequear("lo que ya está igual no se sube", B.pendientesDeSubir([mio], [mio]).length, 0);

/* ---------------------------------------------------------------- */
bloque("La rejilla del mes");
/* Septiembre de 2026 empieza en martes. Con la semana partiendo el lunes,
   la primera casilla es el lunes 31 de agosto. */
var sept = B.rejillaMes(2026, 8);
chequear("semanas completas", sept.every(function(s){ return s.length === 7; }), true);
chequear("la primera casilla es el lunes anterior", sept[0][0].iso, "2026-08-31");
chequear("y viene marcada como de otro mes", sept[0][0].fuera, true);
chequear("el 1 de septiembre es el martes", sept[0][1].iso, "2026-09-01");
chequear("y ese sí es del mes", sept[0][1].fuera, false);
var todos = [];
sept.forEach(function(s){ s.forEach(function(d){ if(!d.fuera) todos.push(d.iso); }); });
chequear("septiembre tiene 30 días", todos.length, 30);
chequear("el último es el 30", todos[29], "2026-09-30");
/* Febrero de 2026 empieza en domingo: el caso que parte la rejilla si el
   corrimiento se calcula con getDay() sin corregir. */
var feb = B.rejillaMes(2026, 1);
chequear("febrero empieza el lunes 26 de enero", feb[0][0].iso, "2026-01-26");
chequear("y el domingo 1 cierra esa semana", feb[0][6].iso, "2026-02-01");

/* ---------------------------------------------------------------- */
bloque("Resumen del mes");
var r = B.resumen([paro, viento], "2026-09-01", "2026-09-30");
chequear("treinta días mirados", r.total, 30);
chequear("dos cerrados", r.cerrado, 2);
/* El 22 está cerrado y con restricción a la vez: cuenta una sola vez, y
   cuenta como cerrado. Sumar los dos daría 31 días en un mes de 30. */
chequear("el día con dos causas no se cuenta dos veces", r.restringido, 0);
chequear("cerrado + restringido no pasa del total", r.cerrado + r.restringido <= r.total, true);
chequear("un rango inválido no inventa días", B.resumen([paro], "x", "y").total, 0);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
