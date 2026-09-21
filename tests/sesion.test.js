/**
 * Pruebas de la sesión. Ejecutar con:  node tests/sesion.test.js
 *
 * No se prueba la red: se prueba lo que decide si un token sirve, que es
 * donde un error se traduce en una sesión que parece viva y devuelve 401 a
 * mitad de un cálculo.
 */
// localStorage mínimo para poder cargar el módulo en Node.
global.localStorage = (function(){
  var m = {};
  return {getItem:function(k){ return k in m ? m[k] : null; },
          setItem:function(k,v){ m[k] = String(v); },
          removeItem:function(k){ delete m[k]; }};
})();

var S = require("../js/sesion.js");

var fallas = 0, total = 0;
function chequear(nombre, obtenido, esperado){
  total++;
  var ok = obtenido === esperado;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + " -> " + obtenido + (ok ? "" : "  (esperado " + esperado + ")"));
}
function bloque(t){ console.log("\n" + t); }

var T0 = new Date(2026, 8, 21, 9, 0, 0).getTime();

/* ---------------------------------------------------------------- */
bloque("Lectura de la respuesta de Supabase Auth");
var ok = S.deRespuesta({access_token:"a1", refresh_token:"r1", expires_in:3600,
                        user:{email:"hector@cmp.cl", id:"u-1"}}, T0);
chequear("guarda el access token", ok.access, "a1");
chequear("guarda el refresh token", ok.refresh, "r1");
chequear("calcula el vencimiento", ok.expiraEn, T0 + 3600000);
chequear("identifica al usuario por correo", ok.usuario, "hector@cmp.cl");
chequear("si no hay correo, por id",
  S.deRespuesta({access_token:"a", refresh_token:"r", user:{id:"u-9"}}, T0).usuario, "u-9");
/* Quedarse sin caducidad es peor que asumir una: un token sin vencimiento se
   usaría muerto para siempre y el usuario vería 401 sin entender por qué. */
chequear("sin expires_in asume una hora",
  S.deRespuesta({access_token:"a", refresh_token:"r"}, T0).expiraEn, T0 + 3600000);
chequear("sin access token no hay sesión", S.deRespuesta({refresh_token:"r"}, T0), null);
chequear("sin refresh token tampoco", S.deRespuesta({access_token:"a"}, T0), null);
chequear("respuesta vacía", S.deRespuesta(null, T0), null);

/* ---------------------------------------------------------------- */
bloque("Cuándo hay que renovar");
var viva = {access:"a", refresh:"r", expiraEn: T0 + 3600000};
chequear("recién emitida, no", S.expirada(viva, T0), false);
chequear("vencida, sí", S.expirada(viva, T0 + 3600001), true);
/* Se renueva ANTES de vencer: esperar al vencimiento hace que la primera
   petición de la mañana falle con 401. */
chequear("a un minuto de vencer, sí", S.expirada(viva, T0 + 3600000 - 60000), true);
chequear("a tres minutos de vencer, no", S.expirada(viva, T0 + 3600000 - 180000), false);
chequear("una sesión nula cuenta como expirada", S.expirada(null, T0), true);
chequear("una sesión sin vencimiento también", S.expirada({access:"a"}, T0), true);

/* ---------------------------------------------------------------- */
bloque("Mensajes de error legibles");
chequear("credenciales malas",
  S.mensajeDeError(400, {error_description:"Invalid login credentials"}),
  "Correo o contraseña incorrectos.");
chequear("correo sin confirmar",
  S.mensajeDeError(400, {msg:"Email not confirmed"}),
  "El usuario existe pero su correo no está confirmado.");
chequear("faltan campos", S.mensajeDeError(422, {}), "Faltan el correo o la contraseña.");
chequear("demasiados intentos", S.mensajeDeError(429, {}), "Demasiados intentos. Espera un minuto.");
chequear("400 sin cuerpo no queda mudo", S.mensajeDeError(400, null), "Correo o contraseña incorrectos.");
chequear("otro error se muestra tal cual", S.mensajeDeError(500, {message:"boom"}), "boom");
chequear("y sin cuerpo, el código", S.mensajeDeError(503, null), "HTTP 503");

/* ---------------------------------------------------------------- */
bloque("Almacenamiento");
chequear("sin nada guardado no hay sesión", S.leer(), null);
chequear("y activa() es falso", S.activa(), false);
localStorage.setItem(S.CLAVE, JSON.stringify(viva));
chequear("una sesión guardada se lee", S.leer().access, "a");
chequear("activa() es verdadero", S.activa(), true);
/* Una sesión a medio escribir no puede pasar por buena: se usaría para
   armar una cabecera Bearer sin token. */
localStorage.setItem(S.CLAVE, JSON.stringify({access:"a"}));
chequear("una sesión sin refresh se descarta", S.leer(), null);
localStorage.setItem(S.CLAVE, "{no es json");
chequear("basura en el almacenamiento no revienta", S.leer(), null);
localStorage.setItem(S.CLAVE, JSON.stringify(Object.assign({}, viva, {usuario:"ana@cmp.cl"})));
chequear("el usuario se recuerda", S.usuario(), "ana@cmp.cl");
S.olvidar();
chequear("olvidar deja limpio", S.leer(), null);

console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
process.exit(fallas === 0 ? 0 : 1);
