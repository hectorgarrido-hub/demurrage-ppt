/**
 * Sesión de usuario contra Supabase Auth, por REST.
 *
 * Sin esto, la sincronización va con la anon key y nada más. Esa key viaja
 * en el navegador —es pública por diseño— así que cualquiera que dé con la
 * URL del sitio puede leer y escribir montos de demurrage y tarifas de
 * contrato. Para tres personas de un equipo eso no alcanza: lo único que
 * separaba los datos de un desconocido era que nadie más conociera el link.
 *
 * Con sesión, las políticas RLS pueden exigir `authenticated` y la anon key
 * deja de abrir la puerta: sin login no hay lectura ni escritura.
 *
 * No hay registro desde la app a propósito. Los usuarios se crean en el
 * panel de Supabase —son tres— y una pantalla de registro abierta en un
 * sitio público es exactamente el agujero que esto viene a tapar.
 *
 * La lógica que decide si un token sirve está separada de la red para poder
 * probarla en Node: es donde un error se traduce en una sesión que parece
 * viva y devuelve 401 a mitad de un cálculo.
 */
(function(global){
  "use strict";

  var CLAVE = "demurrage-ppt.sesion.v1";

  /* Se refresca antes de que expire, no cuando ya expiró: si se espera al
     vencimiento, la primera petición de la mañana falla con 401 y el usuario
     ve un error donde debería ver sus recaladas. */
  var MARGEN_MS = 120000;   // dos minutos

  var oyentes = [];
  function alCambiar(f){ oyentes.push(f); }
  function avisar(){
    var s = leer();
    oyentes.forEach(function(f){ try{ f(s && s.usuario ? s.usuario : null); }catch(e){} });
  }

  /* ──────────────────── lo que se puede probar ────────────────── */

  /** Respuesta de /auth/v1/token -> lo que se guarda. null si no sirve. */
  function deRespuesta(json, ahora){
    if(!json || !json.access_token || !json.refresh_token) return null;
    var t = (ahora instanceof Date ? ahora.getTime() : (ahora || Date.now()));
    /* expires_in viene en segundos. Si el servidor no lo manda se asume una
       hora, que es el valor por defecto de Supabase: quedarse sin caducidad
       es peor —el token se usaría muerto para siempre. */
    var vida = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
    return {
      access: json.access_token,
      refresh: json.refresh_token,
      expiraEn: t + vida * 1000,
      usuario: (json.user && (json.user.email || json.user.id)) || ""
    };
  }

  /** ¿Hay que renovar? Vale también para una sesión nula o rota. */
  function expirada(s, ahora, margen){
    if(!s || !s.access || !s.expiraEn) return true;
    var t = (ahora instanceof Date ? ahora.getTime() : (ahora || Date.now()));
    var m = margen === undefined ? MARGEN_MS : margen;
    return s.expiraEn - m <= t;
  }

  /** Mensaje legible para lo que devuelve Supabase Auth. */
  function mensajeDeError(estado, json){
    var crudo = (json && (json.error_description || json.msg || json.message || json.error)) || "";
    if(estado === 400 || estado === 401){
      if(/email not confirmed/i.test(crudo)) return "El usuario existe pero su correo no está confirmado.";
      if(/invalid login credentials/i.test(crudo)) return "Correo o contraseña incorrectos.";
      /* Un 401 sin motivo NO es lo mismo que una clave mala: suele ser la
         clave del proyecto o una cabecera que falta. Llamarlo «contraseña
         incorrecta» manda a buscar donde no es, y con todos los usuarios
         fallando a la vez esa pista cuesta horas. */
      if(!crudo) return "El servidor rechazó la petición (HTTP " + estado + ") sin decir por qué. " +
                        "Suele ser la clave publicable del proyecto, no la contraseña.";
      if(/invalid/i.test(crudo)) return "Correo o contraseña incorrectos.";
      return crudo + " (HTTP " + estado + ")";
    }
    if(estado === 422) return "Faltan el correo o la contraseña.";
    if(estado === 429) return "Demasiados intentos. Espera un minuto.";
    return crudo || ("HTTP " + estado);
  }

  /* ────────────────────── almacenamiento ──────────────────────── */

  function leer(){
    try{
      var s = JSON.parse(localStorage.getItem(CLAVE) || "null");
      return (s && s.access && s.refresh) ? s : null;
    }catch(e){ return null; }
  }

  function escribir(s){
    try{
      if(s) localStorage.setItem(CLAVE, JSON.stringify(s));
      else localStorage.removeItem(CLAVE);
    }catch(e){ /* almacenamiento bloqueado */ }
    avisar();
  }

  function olvidar(){ escribir(null); }
  function usuario(){ var s = leer(); return s ? s.usuario : ""; }
  /** Hay sesión guardada, aunque el token esté por vencer: se renueva sola. */
  function activa(){ return !!leer(); }

  /* ───────────────────────────── red ──────────────────────────── */

  function urlAuth(cfg, ruta){
    return (cfg.url || "").replace(/\/+$/, "") + "/auth/v1/" + ruta;
  }

  /* Las dos cabeceras, siempre. `supabase-js` manda `apikey` y además
     `Authorization: Bearer <clave del proyecto>` en toda petición de auth, y
     hay despliegues —entre ellos los del formato de claves nuevo— que
     rechazan la petición sin la segunda. Mandando solo `apikey`, el servidor
     contesta 401 y eso se traduce en «correo o contraseña incorrectos»: el
     síntoma es que NINGÚN usuario puede entrar, con la contraseña correcta,
     que es exactamente lo que se veía. En logout sí va el token del usuario,
     porque ahí se está identificando la sesión que se cierra. */
  function pedir(cfg, ruta, cuerpo, token){
    var h = {
      apikey: cfg.anonKey,
      Authorization: "Bearer " + (token || cfg.anonKey),
      "Content-Type": "application/json"
    };
    return fetch(urlAuth(cfg, ruta), {method:"POST", headers:h, body: JSON.stringify(cuerpo || {})})
      .then(function(res){
        return res.text().then(function(txt){
          var json = null;
          try{ json = txt ? JSON.parse(txt) : null; }catch(e){ json = null; }
          if(!res.ok) throw new Error(mensajeDeError(res.status, json));
          return json;
        });
      });
  }

  function iniciar(cfg, email, clave){
    if(!cfg || !cfg.url || !cfg.anonKey){
      return Promise.reject(new Error("Falta configurar el proyecto de Supabase."));
    }
    return pedir(cfg, "token?grant_type=password", {email: email, password: clave})
      .then(function(json){
        var s = deRespuesta(json);
        if(!s) throw new Error("La respuesta del servidor no trae sesión.");
        escribir(s);
        return s;
      });
  }

  /* Una sola renovación en vuelo: al abrir la app se disparan varias
     peticiones a la vez y cada una pediría su propio refresh. Supabase
     invalida el refresh token anterior en cada uso, así que la segunda
     renovación llegaría con un token ya quemado y cerraría la sesión de
     alguien que acaba de entrar. */
  var renovando = null;

  function refrescar(cfg){
    if(renovando) return renovando;
    var s = leer();
    if(!s) return Promise.reject(new Error("No hay sesión que renovar."));
    renovando = pedir(cfg, "token?grant_type=refresh_token", {refresh_token: s.refresh})
      .then(function(json){
        var nueva = deRespuesta(json);
        if(!nueva) throw new Error("La renovación no trajo sesión.");
        // El usuario no siempre vuelve en la respuesta de refresh.
        if(!nueva.usuario) nueva.usuario = s.usuario;
        escribir(nueva);
        renovando = null;
        return nueva;
      })
      .catch(function(err){
        renovando = null;
        olvidar();          // refresh muerto: hay que volver a entrar
        throw err;
      });
    return renovando;
  }

  /** Token válido para una petición de datos, renovando si hace falta. */
  function token(cfg){
    var s = leer();
    if(!s) return Promise.reject(new Error("Sin sesión."));
    if(!expirada(s)) return Promise.resolve(s.access);
    return refrescar(cfg).then(function(n){ return n.access; });
  }

  function cerrar(cfg){
    var s = leer();
    olvidar();
    if(!s || !cfg || !cfg.url) return Promise.resolve(true);
    // Se avisa al servidor, pero la sesión local ya se fue: que el logout
    // remoto falle no puede dejar a alguien dentro.
    return pedir(cfg, "logout", {}, s.access).then(function(){ return true; })
      .catch(function(){ return true; });
  }

  var api = {
    CLAVE: CLAVE, MARGEN_MS: MARGEN_MS,
    deRespuesta: deRespuesta, expirada: expirada, mensajeDeError: mensajeDeError,
    leer: leer, olvidar: olvidar, usuario: usuario, activa: activa, alCambiar: alCambiar,
    iniciar: iniciar, refrescar: refrescar, token: token, cerrar: cerrar
  };
  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Sesion = api;

})(typeof window !== "undefined" ? window : globalThis);
