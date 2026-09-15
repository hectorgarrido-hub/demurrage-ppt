/**
 * Conciliación entre las dos fuentes que hablan de la misma nave.
 *
 * El tablero muestra dos cifras de demurrage para una recalada y no tienen
 * por qué coincidir: miden cosas distintas.
 *
 *   · La banda «Recalada» arma el time sheet desde el CNN-EMB, que es el
 *     registro de tiempos del terminal. Es lo que el terminal sostiene.
 *   · La banda «Temporada» trae lo que el libro de reportería dice que se
 *     liquidó con el armador. Es lo que se pagó.
 *
 * Que difieran es normal; que difieran sin explicación no. En la CNN-EMB-434
 * la diferencia era de US$ 619.552 —despatch a favor contra US$ 601.264 de
 * demurrage— y ninguna de las dos vistas decía por qué. Casi todo venía de
 * dos datos que el CNN-EMB no trae y que nadie había llenado: el rate del
 * contrato y el NOR.
 *
 * Este módulo empareja las dos fuentes y descompone la diferencia en causas
 * con monto, para que se pueda decir cuál de las dos está mal.
 */
(function(global){
  "use strict";

  var MS_HORA = 3600000;

  /* Miles con punto, como el resto del tablero. Sin símbolo de moneda: quien
     arma la frase decide si lleva US$ o no. */
  function miles(n){ return Number(n).toLocaleString("es-CL"); }
  /** Decimal con coma, que es como se escribe acá. */
  function dec(n, cifras){
    return Number(n).toLocaleString("es-CL", {minimumFractionDigits:cifras, maximumFractionDigits:cifras});
  }

  /* Nombres de nave: el CNN-EMB los escribe a mano y la reportería también.
     En la 434 uno dice "MN CHINA THIUMPH" y el otro "CHINA TRIUMPH": un
     prefijo de más y una letra cambiada. Emparejar por igualdad exacta deja
     fuera justo los casos donde la conciliación hace falta. */
  function normalizar(nave){
    return String(nave || "")
      .toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/^(M\/?[VN]|MOTONAVE|B\/?M)\s+/, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  /** Distancia de edición, para tolerar una letra cambiada, no un nombre distinto. */
  function distancia(a, b){
    if(a === b) return 0;
    if(!a.length || !b.length) return Math.max(a.length, b.length);
    var fila = [], i, j;
    for(j = 0; j <= b.length; j++) fila[j] = j;
    for(i = 1; i <= a.length; i++){
      var diagonal = fila[0];
      fila[0] = i;
      for(j = 1; j <= b.length; j++){
        var previo = fila[j];
        fila[j] = Math.min(fila[j] + 1, fila[j-1] + 1,
                           diagonal + (a.charAt(i-1) === b.charAt(j-1) ? 0 : 1));
        diagonal = previo;
      }
    }
    return fila[b.length];
  }

  var MS_DIA = 86400000;

  function aFecha(v){
    if(!v) return null;
    if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Candidatas por nombre: primero las exactas; si no hay, las que difieren
      en una letra por cada ocho, con tope de dos. El umbral es estrecho a
      propósito: dos naves distintas del mismo armador pueden diferir en pocas
      letras, y conciliar contra la nave equivocada es peor que no conciliar. */
  function porNombre(objetivo, recaladas){
    var exactas = [], cercanas = [];
    recaladas.forEach(function(r){
      var n = normalizar(r.nave);
      if(!n) return;
      if(n === objetivo){ exactas.push(r); return; }
      var tope = Math.min(2, Math.floor(Math.max(n.length, objetivo.length) / 8));
      if(distancia(n, objetivo) <= tope) cercanas.push(r);
    });
    return exactas.length ? {filas: exactas, exacta: true}
         : cercanas.length ? {filas: cercanas, exacta: false}
         : null;
  }

  /** Días entre la fecha de la recalada abierta y la de una fila del libro. */
  function separacion(hitos, fila){
    var pares = [["finCarga", "finCarga"], ["inicioCarga", "inicioCarga"], ["primeraEspia", "atb"]];
    var mejor = null;
    pares.forEach(function(par){
      var a = aFecha(hitos && hitos[par[0]]), b = aFecha(fila[par[1]]);
      if(!a || !b) return;
      var d = Math.abs(a - b) / MS_DIA;
      if(mejor === null || d < mejor) mejor = d;
    });
    return mejor;
  }

  /**
   * Busca en la temporada la fila de esta recalada.
   *
   * El nombre no alcanza. En la temporada 2026 hay tres naves con dos
   * recaladas —NISEKO QUEEN, PIGI y MINERAL BOTSWANA— y quedarse con la
   * primera del libro es tomar la equivocada la mitad de las veces. Con la
   * NISEKO QUEEN eso significaba conciliar una recalada de Q3 contra la fila
   * de Q2: el NOR de abril sobre un carguío de septiembre, 139 días de
   * demurrage y una cifra de US$ 4.655.597 que no existe en ninguna parte.
   *
   * Cuando el nombre se repite, decide la fecha: se toma la fila cuyo
   * carguío está más cerca del de la recalada abierta. Si ninguna está cerca,
   * o si dos están igual de cerca, no se concilia y se dice por qué —una
   * conciliación contra la recalada equivocada es peor que ninguna.
   *
   * Devuelve {fila, exacta, ambigua, motivo, candidatas} o null.
   */
  function emparejar(nave, recaladas, hitos){
    if(!nave || !recaladas || !recaladas.length) return null;
    var objetivo = normalizar(nave);
    if(!objetivo) return null;
    var cand = porNombre(objetivo, recaladas);
    if(!cand) return null;

    if(cand.filas.length === 1){
      return {fila: cand.filas[0], exacta: cand.exacta, ambigua: false, candidatas: 1};
    }

    var conFecha = cand.filas.map(function(f){ return {fila: f, dias: separacion(hitos, f)}; })
                             .filter(function(x){ return x.dias !== null; })
                             .sort(function(a, b){ return a.dias - b.dias; });
    var base = {exacta: cand.exacta, candidatas: cand.filas.length};
    if(!conFecha.length){
      return Object.assign({fila: null, ambigua: true,
        motivo: "la nave tiene " + cand.filas.length + " recaladas en la temporada y no hay fechas para distinguirlas"}, base);
    }
    /* 45 días de tolerancia y 15 de separación contra la segunda: una
       recalada dura una semana, así que dos candidatas a menos de dos
       semanas una de otra no se distinguen con confianza. */
    if(conFecha[0].dias > 45){
      return Object.assign({fila: null, ambigua: true,
        motivo: "la nave tiene " + cand.filas.length + " recaladas en la temporada y ninguna cuadra con estas fechas"}, base);
    }
    if(conFecha.length > 1 && (conFecha[1].dias - conFecha[0].dias) < 15){
      return Object.assign({fila: null, ambigua: true,
        motivo: "la nave tiene " + cand.filas.length + " recaladas en la temporada y sus fechas son demasiado parecidas"}, base);
    }
    return Object.assign({fila: conFecha[0].fila, ambigua: false}, base);
  }

  /** Lo liquidado en el libro: demurrage positivo, despatch negativo. */
  function netoLiquidado(fila){
    return (Number(fila.demurrage) || 0) + (Number(fila.despatch) || 0);
  }

  /**
   * Compara el time sheet propio contra lo liquidado y descompone la brecha.
   *
   * app: {tarifaDia, tonelaje, tasaDia, baseInicio, nor, primeraEspia,
   *       permitido, horasUsadas, neto}   — `neto` en la convención del libro:
   *       demurrage positivo, despatch negativo.
   */
  function conciliar(app, fila){
    if(!app || !fila) return null;
    var liquidado = netoLiquidado(fila);
    var propio = Number(app.neto) || 0;
    var causas = [];

    /* 1. El rate. Es el que más pesa y el CNN-EMB no lo trae: sale de un
          campo que alguien tiene que llenar, y por defecto vale 30.000, que
          es la tasa de embarque del contrato, no el demurrage rate. */
    var rateLibro = Number(fila.rate) || 0;
    var rateApp = Number(app.tarifaDia) || 0;
    if(rateLibro > 0 && rateApp > 0 && Math.abs(rateLibro - rateApp) >= 1){
      var diasSobre = (Number(app.horasUsadas) - Number(app.permitido)) / 24;
      causas.push({
        clave: "rate",
        texto: "El rate del contrato es " + miles(rateLibro) + " US$/día y el time sheet usa " + miles(rateApp) + ".",
        monto: diasSobre > 0 ? diasSobre * (rateLibro - rateApp) : 0,
        valorLibro: rateLibro, valorApp: rateApp
      });
    }

    /* 2. El inicio del cómputo. Sin NOR, el laytime arranca en el amarre y se
          pierden los días de espera en rada, que es donde nace el demurrage. */
    var norLibro = aFecha(fila.nor);
    var norApp = aFecha(app.nor);
    if(norLibro && !norApp){
      var espia = aFecha(app.primeraEspia);
      var dias = espia ? (espia - norLibro) / MS_HORA / 24 : null;
      causas.push({
        clave: "nor",
        texto: "El laytime cuenta desde el amarre porque no hay NOR cargado; la reportería trae el NOR." +
          (dias > 0 ? " Son " + dec(dias, 1) + " días de espera que no se están contando." : ""),
        monto: (dias > 0 && rateLibro > 0) ? dias * rateLibro : 0,
        valorLibro: norLibro, valorApp: null
      });
    }else if(norLibro && norApp && Math.abs(norLibro - norApp) > 60000){
      causas.push({
        clave: "nor",
        texto: "El NOR del time sheet y el de la reportería no son el mismo.",
        monto: 0, valorLibro: norLibro, valorApp: norApp
      });
    }

    /* 3. El tonelaje. El time sheet usa el draft survey del terminal; la
          liquidación usa el Bill of Lading. Mueve el allowed, no el rate. */
    var cargoLibro = Number(fila.cargo) || 0;
    var cargoApp = Number(app.tonelaje) || 0;
    var tasa = Number(app.tasaDia) || 0;
    if(cargoLibro > 0 && cargoApp > 0 && Math.abs(cargoLibro - cargoApp) >= 1){
      var horas = tasa > 0 ? (cargoApp - cargoLibro) / tasa * 24 : 0;
      causas.push({
        clave: "tonelaje",
        texto: "El tonelaje del time sheet es el del draft survey y el de la liquidación el del Bill of Lading." +
          (horas ? " Son " + dec(Math.abs(horas), 2) + " h de laytime permitido." : ""),
        monto: (rateLibro > 0) ? -horas / 24 * rateLibro : 0,
        valorLibro: cargoLibro, valorApp: cargoApp
      });
    }

    var diferencia = liquidado - propio;
    var explicado = causas.reduce(function(a, c){ return a + (Number(c.monto) || 0); }, 0);
    return {
      nave: fila.nave,
      liquidado: liquidado,
      propio: propio,
      diferencia: diferencia,
      causas: causas,
      explicado: explicado,
      /* Lo que las causas no alcanzan a explicar: sobre todo las deducciones,
         que son dos listas distintas —las categorías del terminal contra el
         LESS NOT TO COUNT de la agencia— y no se pueden cuadrar desde aquí. */
      sinExplicar: diferencia - explicado
    };
  }

  /** Los datos del contrato que la recalada abierta puede adoptar. */
  function datosDeContrato(fila){
    if(!fila) return null;
    return {
      tarifaDemurrage: Number(fila.rate) || null,
      nor: aFecha(fila.nor),
      tonelaje: Number(fila.cargo) || null
    };
  }

  /* Los campos guardados son cadenas "YYYY-MM-DDTHH:MM" en hora local —salen
     de inputs datetime-local— y el resto de la app las lee con
     parseFechaHora. Escribir un Date ahí reventaba flota.js al recalcular
     («(texto || "").trim is not a function») y, peor, al serializarlo a JSON
     quedaba en UTC: en un navegador fuera de Greenwich el NOR se corría de
     hora sola. Se guarda en el mismo formato que escribe el formulario. */
  function aCampo(d){
    if(!d) return "";
    var dos = function(n){ return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + dos(d.getMonth()+1) + "-" + dos(d.getDate()) +
           "T" + dos(d.getHours()) + ":" + dos(d.getMinutes());
  }

  /** Dos fechas son «la misma» si coinciden al minuto. */
  function mismoMinuto(a, b){
    if(!a || !b) return false;
    return Math.abs(a - b) < 60000;
  }

  /**
   * Toma el NOR de la reportería para todas las recaladas guardadas.
   *
   * El CNN-EMB no trae el NOR: sale del PDF de la agencia o se escribe a
   * mano, y por eso casi todo el historial quedó con el laytime contando
   * desde el amarre. Eso no es un detalle de forma —es la diferencia entre
   * un despatch a favor y seiscientos mil dólares de demurrage.
   *
   * No decide sola: devuelve la lista nueva y el detalle de lo que cambiaría,
   * para que quien aprieta el botón vea qué está aceptando.
   *
   * Al poner un NOR donde no había, cambia también la base del cómputo a
   * «lo primero que ocurra». Dejar el NOR sin cambiar la base sería poner el
   * dato y no usarlo: el laytime seguiría contando desde el amarre y nada de
   * lo que se ve cambiaría.
   */
  function actualizarNor(flota, recaladas){
    var detalle = [];
    var lista = (flota || []).map(function(reg){
      var c = reg.campos || {};
      var par = emparejar(c.nave, recaladas, {
        finCarga: c.finCarga, inicioCarga: c.inicioCarga, primeraEspia: c.primeraEspia
      });
      var base = {id: reg.id, nave: c.nave || "", codigo: c.codigo || ""};

      if(!par){
        detalle.push(Object.assign({estado: "sin emparejar",
          motivo: "no está en el libro de reportería"}, base));
        return reg;
      }
      if(par.ambigua){
        detalle.push(Object.assign({estado: "sin emparejar", motivo: par.motivo}, base));
        return reg;
      }
      var norLibro = aFecha(par.fila.nor);
      if(!norLibro){
        detalle.push(Object.assign({estado: "sin emparejar",
          motivo: "la fila del libro no trae NOR"}, base));
        return reg;
      }
      var norActual = aFecha(c.nor);
      if(mismoMinuto(norActual, norLibro)){
        detalle.push(Object.assign({estado: "igual", nor: norLibro}, base));
        return reg;
      }

      var copia = {};
      for(var k in reg) if(Object.prototype.hasOwnProperty.call(reg, k)) copia[k] = reg[k];
      copia.campos = {};
      for(var j in c) if(Object.prototype.hasOwnProperty.call(c, j)) copia.campos[j] = c[j];
      copia.campos.nor = aCampo(norLibro);
      if(!copia.campos.baseInicio || copia.campos.baseInicio === "amarre"){
        copia.campos.baseInicio = "loPrimero";
      }
      detalle.push(Object.assign({
        estado: norActual ? "reemplazado" : "agregado",
        nor: norLibro, norAnterior: norActual || null,
        trimestre: par.fila.trimestre || ""
      }, base));
      return copia;
    });

    var cuenta = function(e){ return detalle.filter(function(d){ return d.estado === e; }).length; };
    return {
      lista: lista,
      detalle: detalle,
      resumen: {
        total: detalle.length,
        agregados: cuenta("agregado"),
        reemplazados: cuenta("reemplazado"),
        iguales: cuenta("igual"),
        sinEmparejar: cuenta("sin emparejar")
      }
    };
  }

  var api = {normalizar: normalizar, distancia: distancia, emparejar: emparejar,
             actualizarNor: actualizarNor, aCampo: aCampo,
             conciliar: conciliar, netoLiquidado: netoLiquidado,
             datosDeContrato: datosDeContrato};
  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Conciliar = api;

})(typeof window !== "undefined" ? window : globalThis);
