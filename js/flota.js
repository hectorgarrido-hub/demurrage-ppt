/**
 * Flota: varias recaladas de una temporada, guardadas juntas.
 *
 * Cada recalada guarda sus campos crudos (los mismos del formulario) y sus
 * deducciones; los resultados NO se guardan, se recalculan al vuelo. Así, si
 * mañana cambia un criterio del motor, toda la temporada queda al día sola.
 *
 * Sin dependencias del DOM: se usa desde el navegador (window.Flota) y desde
 * Node (require) para las pruebas.
 */
(function(global){
  "use strict";

  var L = (typeof require === "function" && typeof module === "object")
    ? require("./laytime.js") : global.Laytime;

  var CLAVE = "demurrage-ppt.flota.v1";

  /* ─────────────────────── almacenamiento ─────────────────────── */

  function cargar(){
    try{
      var crudo = localStorage.getItem(CLAVE);
      var lista = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(lista) ? lista : [];
    }catch(e){ return []; }
  }

  function guardar(lista){
    try{ localStorage.setItem(CLAVE, JSON.stringify(lista)); return true; }
    catch(e){ return false; }
  }

  /** El código de embarque identifica la recalada: reimportar actualiza, no duplica. */
  function agregar(lista, registro){
    var copia = lista.slice();
    var clave = (registro.campos.codigo || "").trim().toUpperCase();
    var i = clave ? indiceDe(copia, clave) : -1;
    if(i >= 0){
      registro.id = copia[i].id;
      copia[i] = registro;
    }else{
      registro.id = registro.id || ("r" + Date.now() + Math.floor(Math.random()*1000));
      copia.push(registro);
    }
    return ordenar(copia);
  }

  function indiceDe(lista, codigoMayus){
    for(var i=0;i<lista.length;i++){
      if((lista[i].campos.codigo || "").trim().toUpperCase() === codigoMayus) return i;
    }
    return -1;
  }

  function eliminar(lista, id){
    return lista.filter(function(r){ return r.id !== id; });
  }

  /** Orden cronológico por 1ª espía; las que no la tengan van al final. */
  function ordenar(lista){
    return lista.slice().sort(function(a,b){
      var fa = L.parseFechaHora(a.campos.primeraEspia), fb = L.parseFechaHora(b.campos.primeraEspia);
      if(!fa && !fb) return 0;
      if(!fa) return 1;
      if(!fb) return -1;
      return fa - fb;
    });
  }

  /* ──────────────────────── cálculo por recalada ───────────────── */

  function nDe(campos, clave){
    var n = parseFloat(campos[clave]);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Recalcula una recalada completa a partir de sus campos guardados.
   * Devuelve null en `ts` si le faltan hitos para el laytime, pero igual
   * entrega muellaje, índices y detenciones: media recalada sigue sirviendo.
   */
  function calcular(reg){
    var c = reg.campos, d = reg.deducciones || [];

    var inicio = L.inicioLaytime({
      base: c.baseInicio, nor: L.parseFechaHora(c.nor),
      norAceptado: L.parseFechaHora(c.norAceptado),
      primeraEspia: L.parseFechaHora(c.primeraEspia), turnTime: nDe(c,"turnTime")
    });
    var termino = c.baseTermino === "ultimaEspia"
      ? L.parseFechaHora(c.ultimaEspia) : L.parseFechaHora(c.finCarga);

    var permitido = L.laytimePermitido({
      modo: c.modoPermitido, horasFijas: nDe(c,"horasFijas"),
      tonelaje: nDe(c,"tonelaje"),
      tasaDia: nDe(c,"rteTasaDia"),          // la que reporta el RTE, si viene
      tasaHora: nDe(c,"rteTasaHora"),
      tasaEfectiva: nDe(c,"rteTasaEfectiva"), tasaDia: nDe(c,"tasaDia")
    });

    var ts = null;
    if(inicio && termino && termino > inicio && permitido > 0){
      ts = L.calcularTimeSheet({
        inicio: inicio, termino: termino,
        modoConteo: c.modoConteo, festivos: L.leerFestivos(c.festivos),
        deducciones: d, permitido: permitido,
        tarifaDemurrage: nDe(c,"tarifaDemurrage"),
        aplicaDespatch: c.aplicaDespatch !== false,
        porcentajeDespatch: nDe(c,"porcentajeDespatch")
      });
    }

    var muellaje = L.calcularMuellaje({
      primeraEspia: L.parseFechaHora(c.primeraEspia), ultimaEspia: L.parseFechaHora(c.ultimaEspia),
      horasMantenimiento: nDe(c,"horasMantenimientoMuellaje"), horasGira: nDe(c,"horasGira"),
      eslora: nDe(c,"eslora"), tarifa: nDe(c,"tarifaMuelle")
    });

    var mantenimiento = sumaSi(d, function(x){ return x.mantenimiento; });
    var reserva = sumaSi(d, function(x){ return x.lado === "nave"; });
    var indices = L.indices({
      horasTotales: nDe(c,"horasTotales"), horasMantenimiento: mantenimiento,
      horasReserva: reserva, horasOperacionEfectiva: nDe(c,"horasOpEfectiva")
    });

    return {
      id: reg.id,
      nave: c.nave || "(sin nombre)",
      codigo: c.codigo || "",
      tonelaje: nDe(c,"tonelaje"),
      tasaDia: nDe(c,"rteTasaDia"),          // la que reporta el RTE, si viene
      tasaHora: nDe(c,"rteTasaHora"),
      tasaEfectiva: nDe(c,"rteTasaEfectiva"),
      hitos: {
        eta: L.parseFechaHora(c.eta),
        arribo: L.parseFechaHora(c.arribo),
        nor: L.parseFechaHora(c.nor),
        norAceptado: L.parseFechaHora(c.norAceptado),
        freePratique: L.parseFechaHora(c.freePratique),
        primeraEspia: L.parseFechaHora(c.primeraEspia),
        inicioCarga: L.parseFechaHora(c.inicioCarga),
        finCarga: L.parseFechaHora(c.finCarga),
        ultimaEspia: L.parseFechaHora(c.ultimaEspia)
      },
      inicioLaytime: inicio,
      terminoLaytime: termino,
      permitido: permitido,
      ts: ts,
      muellaje: muellaje,
      indices: indices,
      deducciones: d,
      controlable: sumaSi(d, function(x){ return x.lado === "puerto"; }),
      noControlable: sumaSi(d, function(x){ return x.lado === "clima" || x.lado === "nave"; }),
      horasTotales: nDe(c,"horasTotales"),
      opEfectiva: nDe(c,"horasOpEfectiva")
    };
  }

  function sumaSi(lista, filtro){
    return (lista || []).filter(filtro).reduce(function(a,x){ return a + (x.horas || 0); }, 0);
  }

  /* ───────────────────────── consolidado ───────────────────────── */

  /** Totales de la temporada sobre las recaladas ya calculadas. */
  function agregado(calculadas){
    var t = {
      recaladas: calculadas.length,
      tonelaje: 0, demurrage: 0, despatch: 0, muellaje: 0,
      horasTotales: 0, opEfectiva: 0, controlable: 0, noControlable: 0,
      conDemurrage: 0, conDespatch: 0, sinTimeSheet: 0,
      causas: {}
    };
    calculadas.forEach(function(r){
      t.tonelaje += r.tonelaje;
      t.muellaje += r.muellaje.monto;
      t.horasTotales += r.horasTotales;
      t.opEfectiva += r.opEfectiva;
      t.controlable += r.controlable;
      t.noControlable += r.noControlable;
      if(r.ts){
        t.demurrage += r.ts.montoDemurrage;
        t.despatch += r.ts.montoDespatch;
        if(r.ts.esDemurrage) t.conDemurrage++;
        else if(r.ts.montoDespatch > 0) t.conDespatch++;
      }else{
        t.sinTimeSheet++;
      }
      (r.deducciones || []).forEach(function(d){
        if(!(d.horas > 0)) return;
        if(!t.causas[d.nombre]) t.causas[d.nombre] = {nombre:d.nombre, lado:d.lado, horas:0, recaladas:0};
        t.causas[d.nombre].horas += d.horas;
        t.causas[d.nombre].recaladas++;
      });
    });
    t.neto = t.demurrage - t.despatch;
    t.detenciones = t.controlable + t.noControlable;
    t.pctControlable = t.detenciones > 0 ? t.controlable / t.detenciones * 100 : 0;
    t.listaCausas = Object.keys(t.causas).map(function(k){ return t.causas[k]; })
      .sort(function(a,b){ return b.horas - a.horas; });
    return t;
  }

  var api = {
    CLAVE: CLAVE,
    cargar: cargar, guardar: guardar,
    agregar: agregar, eliminar: eliminar, ordenar: ordenar,
    calcular: calcular, agregado: agregado
  };

  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Flota = api;

})(typeof window !== "undefined" ? window : globalThis);
