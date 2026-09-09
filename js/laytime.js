/**
 * Motor de cálculo de laytime, demurrage/despatch y muellaje
 * para embarques en Puerto Punta Totoralillo (PPT).
 *
 * Sin dependencias del DOM: se usa desde el navegador (window.Laytime)
 * y desde Node (require) para las pruebas.
 *
 * Convenciones:
 *  - Todas las duraciones internas están en HORAS decimales.
 *  - Las fechas/hora son objetos Date en hora local.
 */
(function(global){
  "use strict";

  var MS_HORA = 3600000;

  /* ============================ FECHAS ============================ */

  /** "YYYY-MM-DDTHH:MM" (o "YYYY-MM-DD HH:MM") -> Date local. null si es inválida. */
  function parseFechaHora(texto){
    var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec((texto||"").trim());
    if(!m) return null;
    var d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    if(d.getFullYear() !== +m[1] || d.getMonth() !== +m[2]-1 || d.getDate() !== +m[3]) return null;
    return d;
  }

  /** Date -> "YYYY-MM-DD". */
  function aIso(d){
    return d.getFullYear() + "-" +
           String(d.getMonth()+1).padStart(2,"0") + "-" +
           String(d.getDate()).padStart(2,"0");
  }

  /** Texto libre con fechas -> conjunto {iso:true} de festivos. */
  function leerFestivos(texto){
    var set = {};
    (texto||"").split(/[\s,;]+/).forEach(function(t){
      t = t.trim();
      if(/^\d{4}-\d{2}-\d{2}$/.test(t)) set[t] = true;
    });
    return set;
  }

  /** Horas decimales entre dos instantes (0 si el orden es inverso). */
  function horasEntre(inicio, fin){
    if(!inicio || !fin) return 0;
    var h = (fin.getTime() - inicio.getTime()) / MS_HORA;
    return h > 0 ? h : 0;
  }

  /**
   * Horas que NO cuentan como laytime por el régimen de conteo del C/P.
   *   SHINC  : nada se excluye (tiempo corrido).
   *   SHEX   : se excluyen domingos y festivos completos.
   *   SATSHEX: se excluyen sábados desde las 12:00, domingos y festivos.
   */
  function horasExcluidasCalendario(inicio, fin, modo, festivos){
    if(!inicio || !fin || modo === "SHINC") return 0;
    festivos = festivos || {};
    var total = 0;
    var dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    var guarda = 0;
    while(dia <= fin && guarda++ < 4000){
      var siguiente = new Date(dia.getTime()); siguiente.setDate(dia.getDate()+1);
      var dow = dia.getDay();
      var desde = null;
      if(dow === 0 || festivos[aIso(dia)]){
        desde = dia;                                   // domingo o festivo: día completo
      }else if(modo === "SATSHEX" && dow === 6){
        desde = new Date(dia.getTime()); desde.setHours(12,0,0,0);   // sábado desde 12:00
      }
      if(desde){
        var a = Math.max(desde.getTime(), inicio.getTime());
        var b = Math.min(siguiente.getTime(), fin.getTime());
        if(b > a) total += (b - a) / MS_HORA;
      }
      dia = siguiente;
    }
    return total;
  }

  /* ========================== LAYTIME ============================= */

  /**
   * Laytime permitido, en horas.
   *   modo "horas"  -> horasFijas tal cual.
   *   modo "tasa"   -> tonelaje / tasaDia * 24.
   */
  function laytimePermitido(cfg){
    if(!cfg) return 0;
    if(cfg.modo === "tasa"){
      var tasa = Number(cfg.tasaDia);
      if(!tasa || tasa <= 0) return 0;
      return (Number(cfg.tonelaje) || 0) / tasa * 24;
    }
    return Number(cfg.horasFijas) || 0;
  }

  /**
   * Inicio del cómputo de laytime, según lo que diga el charter party.
   *   base "nor"         -> NOR presentado (tendered) + turn time.
   *   base "norAceptado" -> NOR aceptado por el fletador + turn time.
   *   base "amarre"      -> primera espía (all fast), sin turn time.
   *
   * La diferencia entre presentado y aceptado no es menor: en la CNN-EMB-434
   * el NOR se presentó el 14 de agosto y se aceptó el 30, dieciséis días de
   * espera de por medio. Cuál de los dos corre es lo que define el contrato.
   */
  function inicioLaytime(cfg){
    if(!cfg) return null;
    if(cfg.base === "amarre") return cfg.primeraEspia || null;
    var hito = cfg.base === "norAceptado" ? cfg.norAceptado : cfg.nor;
    if(!hito) return null;
    var d = new Date(hito.getTime());
    d.setTime(d.getTime() + (Number(cfg.turnTime) || 0) * MS_HORA);
    return d;
  }

  /** Días de espera entre dos hitos (para el diagrama de estadía y los KPI). */
  function diasEntre(inicio, fin){
    return horasEntre(inicio, fin) / 24;
  }

  /**
   * Cálculo completo del time sheet.
   *
   * entrada = {
   *   inicio, termino,            // Date: inicio del laytime y término de operaciones
   *   modoConteo, festivos,       // "SHINC" | "SHEX" | "SATSHEX", {iso:true}
   *   deducciones: [{nombre, horas, descuenta}],
   *   permitido,                  // horas de laytime allowed
   *   tarifaDemurrage,            // USD/día
   *   aplicaDespatch, porcentajeDespatch  // p.ej. 50 (% del demurrage rate)
   * }
   */
  function calcularTimeSheet(e){
    var transcurridas = horasEntre(e.inicio, e.termino);
    var excluidas = horasExcluidasCalendario(e.inicio, e.termino, e.modoConteo, e.festivos);

    var deducciones = (e.deducciones || []).filter(function(d){ return d.descuenta && Number(d.horas) > 0; });
    var deducidas = deducciones.reduce(function(acc,d){ return acc + Number(d.horas); }, 0);

    // Las deducciones nunca pueden dejar el tiempo usado bajo cero.
    var usadas = transcurridas - excluidas - deducidas;
    var recorte = 0;
    if(usadas < 0){ recorte = -usadas; usadas = 0; }

    var permitido = Number(e.permitido) || 0;
    var balance = permitido - usadas;
    var tarifa = Number(e.tarifaDemurrage) || 0;

    var res = {
      horasTranscurridas: transcurridas,
      horasExcluidas: excluidas,
      horasDeducidas: deducidas - recorte,
      horasUsadas: usadas,
      permitido: permitido,
      balance: balance,
      utilizacion: permitido > 0 ? usadas / permitido * 100 : 0,
      esDemurrage: balance < 0,
      horasDemurrage: 0, montoDemurrage: 0,
      horasDespatch: 0,  montoDespatch: 0
    };

    if(balance < 0){
      res.horasDemurrage = -balance;
      res.montoDemurrage = res.horasDemurrage / 24 * tarifa;
    }else if(e.aplicaDespatch){
      var pct = Number(e.porcentajeDespatch);
      if(isNaN(pct)) pct = 50;
      res.horasDespatch = balance;
      res.montoDespatch = res.horasDespatch / 24 * tarifa * pct / 100;
    }
    return res;
  }

  /* ========================== MUELLAJE ============================ */

  /**
   * Muellaje según la planilla PPT:
   *   NWH = (última espía - 1ª espía) - mtto. terminal - nave a la gira
   *   Muellaje US$ = tarifa (US$/m eslora/hora) x eslora x NWH
   */
  function calcularMuellaje(e){
    var horasMuellaje = horasEntre(e.primeraEspia, e.ultimaEspia);
    var descuentos = (Number(e.horasMantenimiento) || 0) + (Number(e.horasGira) || 0);
    var nwh = horasMuellaje - descuentos;
    if(nwh < 0) nwh = 0;
    nwh = Math.round(nwh * 100) / 100;   // la planilla redondea NWH a 2 decimales
    return {
      horasMuellaje: horasMuellaje,
      descuentos: descuentos,
      nwh: nwh,
      monto: nwh * (Number(e.eslora) || 0) * (Number(e.tarifa) || 0)
    };
  }

  /* ====================== ÍNDICES OPERACIONALES =================== */

  /**
   * DF (disponibilidad física), U (utilización) y FO (factor operacional),
   * encadenados igual que la hoja RESUMEN_TIEMPOS del RTE:
   *
   *   horas disponibles  = total - mantenimiento del terminal
   *   horas operativas   = disponibles - reservas (tiempos de la nave)
   *
   *   DF = disponibles / total
   *   U  = operativas  / disponibles
   *   FO = operación efectiva / operativas
   *
   * Cada índice se mide sobre la base del anterior, no sobre el total: por eso
   * el FO del RTE es más bajo que la simple razón (op. efectiva / total).
   */
  function indices(e){
    var total = Number(e.horasTotales) || 0;
    if(total <= 0) return {df:0, u:0, fo:0, disponibles:0, operativas:0};

    var disponibles = total - (Number(e.horasMantenimiento) || 0);
    if(disponibles < 0) disponibles = 0;
    var operativas = disponibles - (Number(e.horasReserva) || 0);
    if(operativas < 0) operativas = 0;

    return {
      disponibles: disponibles,
      operativas: operativas,
      df: disponibles / total * 100,
      u:  disponibles > 0 ? operativas / disponibles * 100 : 0,
      fo: operativas  > 0 ? (Number(e.horasOperacionEfectiva) || 0) / operativas * 100 : 0
    };
  }

  /* ====================== TASAS DE EMBARQUE ======================= */

  /**
   * Tasas de embarque cuando el libro no trae el bloque del RTE.
   *
   * La planilla divide por el tiempo de EVENTOS REGISTRADOS, no por el reloj
   * del embarque, y los dos no coinciden.  Reproducido contra la CNN-EMB-434:
   * 202.550 t / 131,55 h = 1.540 t/h y x 24 = 36.953 t/día, que son las cifras
   * de la planilla.  Por eso `horasEmbarque` debe ser el total de eventos.
   *
   * La tasa de OPERACIÓN EFECTIVA no se calcula acá a propósito: en la
   * CNN-EMB-434 la planilla reporta 2.103 t/h, y ninguna división del tonelaje
   * por las horas que la app conoce la reproduce (202.550/85,3 = 2.374).  La
   * base de esa tasa vive dentro de la planilla y no está expuesta, así que
   * inventarla sería mostrar un número equivocado con cara de dato.
   */
  function tasasCalculadas(e){
    var ton = Number(e.tonelaje) || 0;
    var horas = Number(e.horasEmbarque) || 0;
    if(ton <= 0 || horas <= 0) return {tasaHora: null, tasaDia: null};
    var porHora = ton / horas;
    return {tasaHora: porHora, tasaDia: porHora * 24};
  }

  /* ============================ FORMATO =========================== */

  /** 30.75 -> "30h 45m" */
  function horasAHm(h){
    var neg = h < 0;
    h = Math.abs(h);
    var horas = Math.floor(h + 1e-9);
    var min = Math.round((h - horas) * 60);
    if(min === 60){ horas++; min = 0; }
    return (neg ? "-" : "") + horas + "h " + String(min).padStart(2,"0") + "m";
  }

  /** 30.75 -> "1d 06:45" */
  function horasADias(h){
    var neg = h < 0;
    h = Math.abs(h);
    var dias = Math.floor(h / 24);
    var resto = h - dias*24;
    var horas = Math.floor(resto + 1e-9);
    var min = Math.round((resto - horas) * 60);
    if(min === 60){ horas++; min = 0; }
    if(horas === 24){ dias++; horas = 0; }
    return (neg ? "-" : "") + dias + "d " + String(horas).padStart(2,"0") + ":" + String(min).padStart(2,"0");
  }

  var api = {
    parseFechaHora: parseFechaHora,
    aIso: aIso,
    leerFestivos: leerFestivos,
    horasEntre: horasEntre,
    horasExcluidasCalendario: horasExcluidasCalendario,
    laytimePermitido: laytimePermitido,
    inicioLaytime: inicioLaytime,
    diasEntre: diasEntre,
    calcularTimeSheet: calcularTimeSheet,
    calcularMuellaje: calcularMuellaje,
    indices: indices,
    tasasCalculadas: tasasCalculadas,
    horasAHm: horasAHm,
    horasADias: horasADias
  };

  if(typeof module === "object" && module.exports) module.exports = api;
  else global.Laytime = api;

})(typeof window !== "undefined" ? window : globalThis);
