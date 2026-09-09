/**
 * Sincronización con Supabase por REST (PostgREST).
 *
 * La nube es opcional: sin configurar, la app funciona igual contra el
 * navegador. Con configuración, el historial de embarques se comparte entre
 * las personas que abran la misma URL.
 *
 * La regla de conflicto es simple y explícita: gana el registro con
 * `actualizado_en` más reciente. Sin bloqueos ni versiones — dos personas
 * editando el mismo embarque a la vez es raro en esta operación, y una regla
 * que nadie entiende es peor que una regla tosca que todos entienden.
 *
 * La fusión y el mapeo van separados de la red para poder probarlos con Node.
 */
(function(global){
  "use strict";

  var CLAVE_CFG = "demurrage-ppt.nube.v1";
  var estadoActual = "off";          // off | sincronizando | ok | error
  var ultimoError = "";
  var oyentes = [];

  /* ─────────────────────── configuración ───────────────────────── */

  function configPorDefecto(){
    // js/config.js puede traer los valores del proyecto; si no, van vacíos.
    var c = global.CONFIG_NUBE || {};
    return {url: c.url || "", anonKey: c.anonKey || "", tabla: c.tabla || "demurrage_embarques"};
  }

  function config(){
    var guardada = null;
    try{ guardada = JSON.parse(localStorage.getItem(CLAVE_CFG) || "null"); }catch(e){ guardada = null; }
    var base = configPorDefecto();
    if(!guardada) return base;
    return {
      url: (guardada.url || base.url || "").replace(/\/+$/, ""),
      anonKey: guardada.anonKey || base.anonKey || "",
      tabla: guardada.tabla || base.tabla || "demurrage_embarques"
    };
  }

  function configurar(cfg){
    try{
      localStorage.setItem(CLAVE_CFG, JSON.stringify({
        url: (cfg.url || "").trim().replace(/\/+$/, ""),
        anonKey: (cfg.anonKey || "").trim(),
        tabla: (cfg.tabla || "").trim() || "demurrage_embarques"
      }));
    }catch(e){ /* almacenamiento bloqueado */ }
    fijarEstado(activa() ? "sincronizando" : "off");
  }

  function olvidar(){
    try{ localStorage.removeItem(CLAVE_CFG); }catch(e){}
    fijarEstado("off");
  }

  function activa(){
    var c = config();
    return !!(c.url && c.anonKey && c.tabla);
  }

  /* ─────────────────────────── estado ──────────────────────────── */

  function fijarEstado(e, mensaje){
    estadoActual = e;
    ultimoError = mensaje || "";
    oyentes.forEach(function(f){ try{ f(e, ultimoError); }catch(err){} });
  }
  function estado(){ return estadoActual; }
  function error(){ return ultimoError; }
  function alCambiar(f){ oyentes.push(f); }

  /* ───────────────────── mapeo registro ↔ fila ─────────────────── */

  /** Fecha con que se ordena el embarque en la nube. */
  function fechaDe(reg, L){
    var c = reg.campos || {};
    var d = (L && L.parseFechaHora)
      ? (L.parseFechaHora(c.primeraEspia) || L.parseFechaHora(c.inicioCarga) || L.parseFechaHora(c.nor))
      : null;
    return d ? d.toISOString() : null;
  }

  function aFila(reg, L){
    return {
      codigo: (reg.campos.codigo || "").trim(),
      nave: reg.campos.nave || "",
      fecha: fechaDe(reg, L),
      campos: reg.campos,
      deducciones: reg.deducciones || [],
      actualizado_en: reg.actualizadoEn || new Date().toISOString()
    };
  }

  function deFila(fila){
    return {
      id: "sb:" + fila.codigo,
      campos: fila.campos || {},
      deducciones: fila.deducciones || [],
      actualizadoEn: fila.actualizado_en || null
    };
  }

  /**
   * Fusiona la lista local con la remota. Empareja por código de embarque y
   * se queda con el más reciente; lo que existe solo en un lado, se conserva.
   * Los registros sin código quedan siempre en local: sin clave no hay
   * forma de emparejarlos ni de subirlos.
   */
  function fusionar(locales, remotos){
    var porCodigo = {}, sueltos = [];
    function clave(r){ return ((r.campos && r.campos.codigo) || "").trim().toUpperCase(); }
    function marca(r){ return r.actualizadoEn ? Date.parse(r.actualizadoEn) || 0 : 0; }

    (locales || []).forEach(function(r){
      var k = clave(r);
      if(!k){ sueltos.push(r); return; }
      porCodigo[k] = r;
    });
    (remotos || []).forEach(function(r){
      var k = clave(r);
      if(!k) return;
      var actual = porCodigo[k];
      if(!actual || marca(r) > marca(actual)){
        // El id local se conserva: es con lo que la interfaz abre la recalada.
        if(actual) r = Object.assign({}, r, {id: actual.id});
        porCodigo[k] = r;
      }
    });
    return Object.keys(porCodigo).map(function(k){ return porCodigo[k]; }).concat(sueltos);
  }

  /**
   * De la lista ya fusionada, cuáles hay que subir: los que no están en la
   * nube y los que allá están más viejos.
   *
   * Subir todo lo local sin mirar es lo que destruye el trabajo ajeno: si otra
   * persona corrigió un embarque hace un minuto y yo empujo mi copia vieja,
   * su corrección desaparece. Primero se lee, se fusiona, y recién entonces se
   * sube lo que de verdad es más nuevo.
   */
  function pendientesDeSubir(fusionados, remotos){
    function clave(r){ return ((r.campos && r.campos.codigo) || "").trim().toUpperCase(); }
    function marca(r){ return r && r.actualizadoEn ? Date.parse(r.actualizadoEn) || 0 : 0; }
    var enNube = {};
    (remotos || []).forEach(function(r){ enNube[clave(r)] = r; });
    return (fusionados || []).filter(function(r){
      var k = clave(r);
      if(!k) return false;                       // sin código no se puede subir
      var rem = enNube[k];
      return !rem || marca(r) > marca(rem);
    });
  }

  /* ────────────────────────────── red ──────────────────────────── */

  function cabeceras(extra){
    var c = config();
    var h = {apikey: c.anonKey, Authorization: "Bearer " + c.anonKey};
    for(var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  function listar(){
    if(!activa()) return Promise.resolve([]);
    var c = config();
    fijarEstado("sincronizando");
    return fetch(c.url + "/rest/v1/" + c.tabla + "?select=*&order=fecha.desc.nullslast",
                 {method:"GET", headers: cabeceras()})
      .then(function(res){
        if(!res.ok) throw new Error("HTTP " + res.status + " al leer " + c.tabla);
        return res.json();
      })
      .then(function(filas){
        fijarEstado("ok");
        return (Array.isArray(filas) ? filas : []).map(deFila);
      })
      .catch(function(err){ fijarEstado("error", err.message); throw err; });
  }

  function guardar(reg, L){
    if(!activa()) return Promise.resolve(false);
    var fila = aFila(reg, L);
    if(!fila.codigo) return Promise.resolve(false);   // sin clave no se sube
    var c = config();
    fijarEstado("sincronizando");
    return fetch(c.url + "/rest/v1/" + c.tabla, {
      method: "POST",
      headers: cabeceras({"Content-Type":"application/json",
                          Prefer:"resolution=merge-duplicates,return=minimal"}),
      body: JSON.stringify(fila)
    }).then(function(res){
      if(!res.ok) throw new Error("HTTP " + res.status + " al guardar " + fila.codigo);
      fijarEstado("ok");
      return true;
    }).catch(function(err){ fijarEstado("error", err.message); return false; });
  }

  function eliminar(codigo){
    if(!activa() || !codigo) return Promise.resolve(false);
    var c = config();
    fijarEstado("sincronizando");
    return fetch(c.url + "/rest/v1/" + c.tabla + "?codigo=eq." + encodeURIComponent(codigo),
                 {method:"DELETE", headers: cabeceras({Prefer:"return=minimal"})})
      .then(function(res){
        if(!res.ok) throw new Error("HTTP " + res.status + " al eliminar " + codigo);
        fijarEstado("ok");
        return true;
      }).catch(function(err){ fijarEstado("error", err.message); return false; });
  }

  /** Comprueba credenciales contra la tabla, sin traer datos. */
  function probar(){
    var c = config();
    if(!c.url || !c.anonKey) return Promise.reject(new Error("Falta la URL o la anon key."));
    return fetch(c.url + "/rest/v1/" + c.tabla + "?select=codigo&limit=1", {headers: cabeceras()})
      .then(function(res){
        if(res.status === 404) throw new Error("La tabla «" + c.tabla + "» no existe en ese proyecto.");
        if(res.status === 401 || res.status === 403) throw new Error("Credenciales rechazadas (HTTP " + res.status + "). Revisa la anon key y las políticas RLS.");
        if(!res.ok) throw new Error("HTTP " + res.status);
        fijarEstado("ok");
        return true;
      });
  }

  var api = {
    config: config, configurar: configurar, olvidar: olvidar, activa: activa,
    estado: estado, error: error, alCambiar: alCambiar,
    aFila: aFila, deFila: deFila, fusionar: fusionar, pendientesDeSubir: pendientesDeSubir,
    listar: listar, guardar: guardar, eliminar: eliminar, probar: probar
  };
  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Nube = api;

})(typeof window !== "undefined" ? window : globalThis);
