/**
 * Semáforo y lectura de una recalada.
 *
 * Convierte los números en una frase que alguien pueda repetir después de la
 * reunión. Es la diferencia entre un tablero operativo y uno ejecutivo: la
 * gerencia no se lleva el gráfico, se lleva la frase.
 *
 * Sin dependencias del DOM: se prueba con Node.
 */
(function(global){
  "use strict";

  /* Umbrales del semáforo. Explícitos a propósito: un estado de color sin
     criterio escrito es una opinión disfrazada de dato. */
  var UMBRALES = {
    controlableAlto: 60,   // % de detenciones atribuibles al terminal
    esperaAtencion: 3,     // días entre el NOR y el amarre
    esperaCritica: 7,
    utilizacionAlta: 90    // % del laytime consumido
  };

  function usd(v){
    return "US$ " + Math.round(Math.abs(v)).toLocaleString("es-CL");
  }
  function horas(h){
    var n = Math.abs(h);
    var e = Math.floor(n + 1e-9), m = Math.round((n - e) * 60);
    if(m === 60){ e++; m = 0; }
    return e + " h " + String(m).padStart(2,"0") + " min";
  }
  function pct(v){
    return (Math.round(v*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " %";
  }
  function dias(d){
    return (Math.round(d*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " días";
  }

  /**
   * Estado de la recalada.
   * d = {ts, controlable, noControlable, esperaDias, causaMayor, tasaDia, tasaPactada}
   */
  function estado(d){
    var motivos = [];
    var nivel = "ok";

    if(d.ts && d.ts.esDemurrage){
      nivel = "critico";
      motivos.push("la operación excedió el laytime en " + horas(d.ts.horasDemurrage));
    }
    var detenciones = (d.controlable || 0) + (d.noControlable || 0);
    var pctControlable = detenciones > 0 ? d.controlable / detenciones * 100 : 0;
    if(detenciones > 0 && pctControlable > UMBRALES.controlableAlto){
      if(nivel === "ok") nivel = "atencion";
      motivos.push(pct(pctControlable) + " de las detenciones fue controlable por el terminal");
    }
    if(d.esperaDias >= UMBRALES.esperaCritica){
      nivel = "critico";
      motivos.push("la nave esperó " + dias(d.esperaDias) + " desde el NOR hasta el amarre");
    }else if(d.esperaDias >= UMBRALES.esperaAtencion){
      if(nivel === "ok") nivel = "atencion";
      motivos.push("la nave esperó " + dias(d.esperaDias) + " desde el NOR");
    }
    if(d.ts && !d.ts.esDemurrage && d.ts.utilizacion >= UMBRALES.utilizacionAlta){
      if(nivel === "ok") nivel = "atencion";
      motivos.push("el laytime se consumió al " + pct(d.ts.utilizacion));
    }

    var titulo = nivel === "critico" ? "Recalada con costo"
               : nivel === "atencion" ? "Recalada con reparos"
               : "Recalada limpia";
    return {nivel: nivel, titulo: titulo, motivos: motivos};
  }

  /**
   * Lectura en prosa. Devuelve frases sueltas para que la vista decida
   * cómo mostrarlas.
   */
  function parrafos(d){
    var p = [];
    var nave = d.nave || "La nave";

    if(d.ts){
      if(d.ts.esDemurrage){
        p.push(nave + " generó " + usd(d.ts.montoDemurrage) + " de demurrage: usó " +
          horas(d.ts.horasUsadas) + " de laytime contra " + horas(d.ts.permitido) +
          " permitidas, " + horas(d.ts.horasDemurrage) + " por sobre el contrato.");
      }else if(d.ts.montoDespatch > 0){
        p.push(nave + " terminó dentro del laytime y deja " + usd(d.ts.montoDespatch) +
          " de despatch a favor: usó " + horas(d.ts.horasUsadas) + " de las " +
          horas(d.ts.permitido) + " permitidas.");
      }else{
        p.push(nave + " terminó dentro del laytime permitido, sin demurrage ni despatch.");
      }
    }

    if(d.esperaDias > 0){
      p.push("Esperó " + dias(d.esperaDias) + " entre el NOR y el amarre" +
        (d.norAceptadoTexto ? ", con el NOR aceptado el " + d.norAceptadoTexto : "") + ".");
    }

    var detenciones = (d.controlable || 0) + (d.noControlable || 0);
    if(detenciones > 0){
      var frase = "De las " + horas(detenciones) + " detenidas, " +
        pct(d.controlable / detenciones * 100) + " fue controlable por el terminal";
      if(d.causaMayor && d.causaMayor.horas > 0){
        // Sin toLowerCase: arruina las siglas del RTE ("IMOPAC" -> "imopac").
        frase += "; la causa mayor fue " + d.causaMayor.nombre + " con " + horas(d.causaMayor.horas);
      }
      p.push(frase + ".");
    }

    if(d.tasaDia > 0 && d.tasaPactada > 0){
      var dif = (d.tasaDia - d.tasaPactada) / d.tasaPactada * 100;
      p.push("El embarque promedió " + Math.round(d.tasaDia).toLocaleString("es-CL") +
        " t/día, " + (dif >= 0 ? "un " + pct(dif) + " sobre" : "un " + pct(-dif) + " bajo") +
        " la tasa pactada de " + Math.round(d.tasaPactada).toLocaleString("es-CL") + " t/día.");
    }

    if(d.muellaje > 0){
      p.push("El muellaje facturable de la estadía es " + usd(d.muellaje) + ".");
    }
    return p;
  }

  /**
   * Cascada del resultado en dinero. Cada hora tiene precio: el mismo rate
   * diario del demurrage. Así se ve cuánto ahorró cada excepción del contrato.
   */
  function cascadaDinero(ts, tarifaDia){
    if(!ts || !(tarifaDia > 0)) return [];
    var porHora = tarifaDia / 24;
    var pasos = [
      {nombre:"Tiempo transcurrido", valor: ts.horasTranscurridas * porHora, tipo:"base"}
    ];
    if(ts.horasExcluidas > 0){
      pasos.push({nombre:"(−) Régimen de conteo", valor: ts.horasExcluidas * porHora, tipo:"resta"});
    }
    if(ts.horasDeducidas > 0){
      pasos.push({nombre:"(−) Deducciones del C/P", valor: ts.horasDeducidas * porHora, tipo:"resta"});
    }
    /* El laytime permitido va como línea de referencia, no como resta.
       Restarlo dejaba el acumulado en negativo siempre que la recalada
       terminaba dentro del allowed —o sea, casi siempre— y la barra se
       dibujaba hacia la izquierda, encima de las etiquetas. Esta es "la misma
       cascada, en dinero": tiene que tener los mismos pasos que la de horas. */
    pasos.push({nombre:"Laytime usado", valor: ts.horasUsadas * porHora, tipo:"total"});
    return pasos;
  }

  var api = {UMBRALES: UMBRALES, estado: estado, parrafos: parrafos, cascadaDinero: cascadaDinero};
  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Lectura = api;

})(typeof window !== "undefined" ? window : globalThis);
