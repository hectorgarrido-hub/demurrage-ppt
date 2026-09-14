/**
 * Consolidado de la temporada por trimestre y lectura de lo que dice.
 *
 * El libro de reportería tiene el dato pero no la conclusión. Lo que estas
 * funciones arman es la comparación que el libro no hace explícita:
 *
 *   la operación de carga cabe dentro del laytime permitido, casi siempre;
 *   lo que genera el demurrage es la espera ANTES del amarre.
 *
 * Esa distinción cambia a quién le corresponde actuar: si el problema fuera la
 * tasa de embarque, es del terminal; si es la espera en rada, es de
 * programación de naves y de congestión de muelle, que se gestionan en otra
 * parte y con otra gente.
 *
 * Sin dependencias del DOM: se usa desde el navegador y desde Node.
 */
(function(global){
  "use strict";

  var ORDEN = ["Q1", "Q2", "Q3", "Q4"];

  function porTrimestreOrden(a, b){
    return ORDEN.indexOf(a) - ORDEN.indexOf(b);
  }

  function normalizar(t){
    return String(t == null ? "" : t)
      .normalize("NFD").replace(/[̀-ͯ]/g,"")
      .toLowerCase().replace(/\s+/g," ").trim();
  }

  function suma(lista, f){
    return lista.reduce(function(acc, x){ return acc + (Number(f(x)) || 0); }, 0);
  }

  /** Días entre dos instantes, o null si falta alguno. */
  function diasEntre(a, b){
    if(!a || !b) return null;
    return (b.getTime() - a.getTime()) / 86400000;
  }

  /**
   * ¿La nave llegó dentro de su ventana de laycan?
   *   "antes"  -> el ETA precede al inicio del laycan (espera por contrato)
   *   "dentro" -> llegó en ventana
   *   "tarde"  -> llegó pasado el fin del laycan (el fletador puede cancelar)
   */
  function estadoLaycan(r){
    if(!r || !r.eta || !r.laycanDesde || !r.laycanHasta) return null;
    if(r.eta < r.laycanDesde) return "antes";
    if(r.eta > r.laycanHasta) return "tarde";
    return "dentro";
  }

  /** Agrupa una lista por trimestre, sumando un campo. */
  function agruparPorTrimestre(lista, campo){
    var m = {};
    (lista || []).forEach(function(x){
      if(!x || !x.trimestre) return;
      m[x.trimestre] = (m[x.trimestre] || 0) + (Number(x[campo]) || 0);
    });
    return m;
  }

  /** Detenciones sumadas por categoría, de mayor a menor. */
  function categorias(detenciones){
    var m = {};
    (detenciones || []).forEach(function(d){
      var k = String(d.categoria || "").trim();
      if(!k) return;
      if(!m[k]) m[k] = {categoria: k, dias: 0, costo: 0, eventos: 0};
      m[k].dias += Number(d.dias) || 0;
      m[k].costo += Number(d.costo) || 0;
      m[k].eventos++;
    });
    return Object.keys(m).map(function(k){ return m[k]; })
      .sort(function(a, b){ return b.dias - a.dias; });
  }

  /**
   * Un objeto por trimestre con todo lo que el tablero necesita.
   *
   * `tiempos` se cruza por nombre de nave. Es lo único que hay para unir las
   * dos hojas —no existe un código de recalada en el libro comercial—, así que
   * una nave que se repite en la temporada (PIGI, NISEKO QUEEN y MINERAL
   * BOTSWANA aparecen dos veces) se desempata por trimestre.
   */
  function porTrimestre(datos){
    datos = datos || {};
    var recaladas = datos.recaladas || [];
    var tiempos = datos.tiempos || [];
    var detenciones = datos.detenciones || [];
    var clima = datos.clima || [];

    var indiceTiempos = {};
    tiempos.forEach(function(t){
      indiceTiempos[t.trimestre + "|" + normalizar(t.nave)] = t;
    });

    var pres = {};
    recaladas.forEach(function(r){
      if(!pres[r.trimestre]) pres[r.trimestre] = [];
      pres[r.trimestre].push(r);
    });

    return Object.keys(pres).sort(porTrimestreOrden).map(function(q){
      var lista = pres[q];
      var conTiempos = lista.map(function(r){
        return indiceTiempos[q + "|" + normalizar(r.nave)] || null;
      }).filter(Boolean);

      var demurrage = suma(lista, function(r){ return r.demurrage; });
      // El despatch viene negativo en el libro: se guarda como magnitud y el
      // neto lo resta, para que nadie tenga que adivinar el signo al leerlo.
      var despatch = Math.abs(suma(lista, function(r){ return r.despatch; }));
      var cargo = suma(lista, function(r){ return r.cargo; });

      var esperaDem = [], esperaSin = [];
      lista.forEach(function(r){
        var d = diasEntre(r.nor, r.atb);
        if(d == null) return;
        (r.demurrage > 0 ? esperaDem : esperaSin).push(d);
      });
      function promedio(v){ return v.length ? v.reduce(function(a,b){ return a+b; }, 0) / v.length : null; }

      var laycan = {antes: 0, dentro: 0, tarde: 0};
      lista.forEach(function(r){
        var e = estadoLaycan(r);
        if(e) laycan[e]++;
      });

      var dets = detenciones.filter(function(d){ return d.trimestre === q; });
      var operacion = suma(conTiempos, function(t){ return t.operacionCarga; });
      var allowed = suma(conTiempos, function(t){ return t.timeAllowed; });

      return {
        trimestre: q,
        naves: lista.length,
        enDemurrage: lista.filter(function(r){ return r.demurrage > 0; }).length,
        enDespatch: lista.filter(function(r){ return r.despatch !== 0; }).length,
        demurrage: demurrage,
        despatch: despatch,
        neto: demurrage - despatch,
        cargo: cargo,
        usdPorTonelada: cargo > 0 ? (demurrage - despatch) / cargo : 0,

        espera: suma(conTiempos, function(t){ return t.esperaAmarre; }),
        operacion: operacion,
        allowed: allowed,
        // Naves cuya carga cupo dentro del laytime permitido: si son casi
        // todas, el problema no está en el muelle.
        dentroDelAllowed: conTiempos.filter(function(t){ return t.operacionCarga <= t.timeAllowed; }).length,
        conTiempos: conTiempos.length,
        usoDelAllowed: allowed > 0 ? operacion / allowed * 100 : 0,

        esperaConDemurrage: promedio(esperaDem),
        esperaSinDemurrage: promedio(esperaSin),
        laycan: laycan,

        detenciones: categorias(dets),
        diasDetenidos: suma(dets, function(d){ return d.dias; }),
        costoDetenciones: suma(dets, function(d){ return d.costo; }),
        clima: clima.filter(function(c){ return c.trimestre === q; })
                    .sort(function(a,b){ return b.dias - a.dias; }),
        diasClima: suma(clima.filter(function(c){ return c.trimestre === q; }), function(c){ return c.dias; }),
        recaladas: lista
      };
    });
  }

  /** Totales de la temporada, sobre los trimestres ya agregados. */
  function total(trimestres){
    trimestres = trimestres || [];
    var cargo = suma(trimestres, function(t){ return t.cargo; });
    var demurrage = suma(trimestres, function(t){ return t.demurrage; });
    var despatch = suma(trimestres, function(t){ return t.despatch; });
    var allowed = suma(trimestres, function(t){ return t.allowed; });
    var operacion = suma(trimestres, function(t){ return t.operacion; });
    return {
      trimestres: trimestres.length,
      naves: suma(trimestres, function(t){ return t.naves; }),
      enDemurrage: suma(trimestres, function(t){ return t.enDemurrage; }),
      demurrage: demurrage,
      despatch: despatch,
      neto: demurrage - despatch,
      cargo: cargo,
      usdPorTonelada: cargo > 0 ? (demurrage - despatch) / cargo : 0,
      espera: suma(trimestres, function(t){ return t.espera; }),
      operacion: operacion,
      allowed: allowed,
      usoDelAllowed: allowed > 0 ? operacion / allowed * 100 : 0,
      dentroDelAllowed: suma(trimestres, function(t){ return t.dentroDelAllowed; }),
      conTiempos: suma(trimestres, function(t){ return t.conTiempos; }),
      diasDetenidos: suma(trimestres, function(t){ return t.diasDetenidos; }),
      diasClima: suma(trimestres, function(t){ return t.diasClima; })
    };
  }

  /**
   * La conclusión en prosa: qué dicen estos números juntos.
   *
   * Se escribe acá y no en el render porque es una afirmación sobre los datos,
   * y como tal tiene que poder probarse sin abrir un navegador.
   */
  function diagnostico(trimestres){
    var t = total(trimestres);
    var frases = [];

    if(t.allowed > 0){
      frases.push("La operación de carga usó " + redondear(t.operacion, 1) + " de los " +
        redondear(t.allowed, 1) + " días permitidos (" + redondear(t.usoDelAllowed, 0) + " %): " +
        t.dentroDelAllowed + " de " + t.conTiempos + " naves cargaron dentro del laytime.");
    }
    if(t.operacion > 0 && t.espera > 0){
      frases.push("La espera previa al amarre sumó " + redondear(t.espera, 1) + " días, " +
        redondear(t.espera / t.operacion, 1) + " veces el tiempo de carga. Ahí está el demurrage, no en el muelle.");
    }

    var conDem = [], sinDem = [];
    trimestres.forEach(function(q){
      if(q.esperaConDemurrage != null) conDem.push(q.esperaConDemurrage);
      if(q.esperaSinDemurrage != null) sinDem.push(q.esperaSinDemurrage);
    });
    function prom(v){ return v.length ? v.reduce(function(a,b){ return a+b; },0)/v.length : null; }
    var pc = prom(conDem), ps = prom(sinDem);
    if(pc != null && ps != null){
      frases.push("Las naves que pagaron demurrage esperaron " + redondear(pc, 1) +
        " días entre el NOR y el amarre; las que no, " + redondear(ps, 1) + ".");
    }

    var peor = null;
    trimestres.forEach(function(q){ if(!peor || q.neto > peor.neto) peor = q; });
    if(peor && trimestres.length > 1){
      var resto = trimestres.filter(function(q){ return q !== peor; });
      var promResto = resto.length ? suma(resto, function(q){ return q.neto; }) / resto.length : 0;
      if(promResto > 0){
        frases.push(peor.trimestre + " concentra " + moneda(peor.neto) + ", " +
          redondear(peor.neto / promResto, 1) + " veces el promedio de los demás trimestres.");
      }
    }

    return {
      total: t,
      peorTrimestre: peor,
      esperaConDemurrage: pc,
      esperaSinDemurrage: ps,
      frases: frases
    };
  }

  function redondear(n, d){
    var f = Math.pow(10, d || 0);
    return (Math.round((Number(n) || 0) * f) / f).toLocaleString("es-CL");
  }
  function moneda(n){
    return "US$ " + Math.round(Number(n) || 0).toLocaleString("es-CL");
  }

  var api = {
    ORDEN: ORDEN,
    porTrimestre: porTrimestre,
    total: total,
    diagnostico: diagnostico,
    categorias: categorias,
    estadoLaycan: estadoLaycan,
    agruparPorTrimestre: agruparPorTrimestre,
    diasEntre: diasEntre
  };

  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Trimestres = api;

})(typeof window !== "undefined" ? window : globalThis);
