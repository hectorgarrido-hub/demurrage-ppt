/**
 * Lector del "Registro de Tiempos de Embarque" (libro CNN-EMB-XXX.xlsx) de PPT.
 *
 * Extrae los datos de la recalada desde las hojas RESUMEN_TIEMPOS, RTE y MUELLAJE
 * y los deja listos para el motor de laytime.  El libro se lee con SheetJS en el
 * navegador; aquí solo se trabaja sobre el objeto workbook ya parseado.
 *
 * Es defensivo a propósito: si una hoja o una celda no está donde se espera,
 * devuelve un aviso en vez de fallar, y el usuario completa el dato a mano.
 */
(function(global){
  "use strict";

  /* Clasificación por defecto de cada categoría de detención del RTE.
       descuenta     -> el tiempo NO cuenta como laytime usado (manda el charter party).
       mantenimiento -> entra en el mantenimiento del terminal que rebaja la DF.
     Las categorías de lado "nave" son las reservas que rebajan la U. */
  var CATEGORIAS = [
    // --- Detenciones de puerto: corren contra el fletador (CMP) ---
    {clave:"Mtto. Mec.",                    lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Mtto. Eléctr.",                 lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Atoros",                        lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Corte correa",                  lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Cambio polines",                lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Daño estructural Lin. Embarque",lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Mtto correctivo operacion",     lado:"puerto", descuenta:false, mantenimiento:true},
    {clave:"Limpieza linea embarque",       lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"En espera de carga",            lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"Cambio turno IMOPAC",           lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"Corridas",                      lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"Cambio Bodega",                 lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"Calado Puerto",                 lado:"puerto", descuenta:false, mantenimiento:false},
    {clave:"Incendio",                      lado:"puerto", descuenta:true,  mantenimiento:false},
    // --- Excepciones habituales del C/P ---
    {clave:"Eventos climáticos",            lado:"clima",  descuenta:true,  mantenimiento:false},
    {clave:"Eventos de fuerza mayor",       lado:"clima",  descuenta:true,  mantenimiento:false},
    // --- Detenciones de la nave: tiempo del armador, no cuenta como laytime ---
    {clave:"Calado Nave",                   lado:"nave",   descuenta:true,  mantenimiento:false},
    {clave:"Deslastre",                     lado:"nave",   descuenta:true,  mantenimiento:false},
    {clave:"Amarras",                       lado:"nave",   descuenta:true,  mantenimiento:false},
    {clave:"Preparativo maniobra corrida nave", lado:"nave", descuenta:true, mantenimiento:false},
    {clave:"Otros Nave",                    lado:"nave",   descuenta:true,  mantenimiento:false}
  ];

  function normalizar(t){
    return String(t == null ? "" : t)
      .normalize("NFD").replace(/[̀-ͯ]/g,"")
      .toLowerCase().replace(/\s+/g," ").trim();
  }

  function hoja(libro, nombre){
    var objetivo = normalizar(nombre);
    for(var i=0;i<libro.SheetNames.length;i++){
      if(normalizar(libro.SheetNames[i]) === objetivo) return libro.Sheets[libro.SheetNames[i]];
    }
    return null;
  }

  function celda(ws, ref){
    if(!ws) return null;
    var c = ws[ref];
    return (c && c.v !== undefined) ? c.v : null;
  }

  function numero(v){
    if(v == null || v === "") return null;
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",","."));
    return isNaN(n) ? null : n;
  }

  /** Convierte a "YYYY-MM-DDTHH:MM" un valor de celda (Date o serial de Excel). */
  function aInputDateTime(v){
    var d = null;
    if(v instanceof Date) d = v;
    else if(typeof v === "number"){                       // serial de Excel (base 1899-12-30)
      d = new Date(Math.round((v - 25569) * 86400000));
      d = new Date(d.getTime() + d.getTimezoneOffset()*60000);
    }else if(typeof v === "string"){
      var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(v.trim());
      if(m) d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    }
    if(!d || isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" +
      String(d.getMonth()+1).padStart(2,"0") + "-" +
      String(d.getDate()).padStart(2,"0") + "T" +
      String(d.getHours()).padStart(2,"0") + ":" +
      String(d.getMinutes()).padStart(2,"0");
  }

  /** Índice de columna (0=A) -> letra ("A", "B", ... "AA"). */
  function letra(i){
    var s = "";
    i = i + 1;
    while(i > 0){
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /**
   * Busca en una hoja la fila cuya columna `col` contiene `texto` (comparación
   * laxa) y devuelve el valor de la columna `colValor` en esa fila.
   */
  function valorPorEtiqueta(ws, texto, col, colValor, maxFila){
    if(!ws) return null;
    var objetivo = normalizar(texto);
    for(var f=1; f<=(maxFila||60); f++){
      var etiqueta = normalizar(celda(ws, col + f));
      if(etiqueta && etiqueta.indexOf(objetivo) === 0) return celda(ws, colValor + f);
    }
    return null;
  }

  /** Números de fila cuya columna `col` empieza con `texto`. */
  function filasPorEtiqueta(ws, texto, col, maxFila){
    var objetivo = normalizar(texto), filas = [];
    if(!ws) return filas;
    for(var f=1; f<=(maxFila||240); f++){
      var etiqueta = normalizar(celda(ws, col + f));
      if(etiqueta && etiqueta.indexOf(objetivo) === 0) filas.push(f);
    }
    return filas;
  }

  /**
   * Valor de una etiqueta que aparece repetida, distinguida por su unidad.
   * En el RTE, "TOTAL TIEMPO DESDE INICIO EMBARQUE" aparece dos veces —una en
   * minutos y otra en horas— y no son la misma cantidad: la de minutos es el
   * reloj entre inicio y fin de embarque, y la de horas es la suma de los
   * eventos registrados. Confundirlas cambia todas las tasas.
   */
  function valorPorUnidad(ws, texto, colEtiq, colValor, colUnidad, unidad, maxFila){
    var filas = filasPorEtiqueta(ws, texto, colEtiq, maxFila);
    var objetivo = normalizar(unidad);
    for(var i=0;i<filas.length;i++){
      if(normalizar(celda(ws, colUnidad + filas[i])) === objetivo) return celda(ws, colValor + filas[i]);
    }
    return null;
  }

  /**
   * Lee las horas por categoría desde RESUMEN_TIEMPOS
   * (fila 3 = etiquetas, fila 4 = horas), recorriendo las columnas B..AB.
   */
  function leerCategorias(ws){
    var encontrado = {};
    if(!ws) return encontrado;
    for(var i=1;i<=27;i++){                       // B..AB
      var col = letra(i);
      var etiqueta = celda(ws, col + "3");
      var horas = numero(celda(ws, col + "4"));
      if(etiqueta && horas !== null) encontrado[normalizar(etiqueta)] = horas;
    }
    return encontrado;
  }

  /**
   * Punto de entrada: recibe un workbook de SheetJS, devuelve los datos de la recalada.
   */
  function desdeLibro(libro){
    var avisos = [];
    var resumen  = hoja(libro, "RESUMEN_TIEMPOS");
    var rte      = hoja(libro, "RTE");
    var muellaje = hoja(libro, "MUELLAJE");

    if(!resumen)  avisos.push("No se encontró la hoja RESUMEN_TIEMPOS: las detenciones quedan en blanco.");
    if(!rte)      avisos.push("No se encontró la hoja RTE: nave, código y tonelaje quedan en blanco.");
    if(!muellaje) avisos.push("No se encontró la hoja MUELLAJE: espías, eslora y tarifa quedan en blanco.");

    var horasPorCategoria = leerCategorias(resumen);
    var deducciones = CATEGORIAS.map(function(c){
      var horas = horasPorCategoria[normalizar(c.clave)];
      return {
        nombre: c.clave,
        lado: c.lado,
        horas: horas === undefined ? 0 : horas,
        descuenta: c.descuenta,
        mantenimiento: c.mantenimiento,
        encontrada: horas !== undefined
      };
    });
    var noEncontradas = deducciones.filter(function(d){ return !d.encontrada; });

    var totalEmbarque   = horasPorCategoria[normalizar("TOTAL EMBARQUE")];
    var opEfectiva      = horasPorCategoria[normalizar("Tiempo Op. Efectiva")];

    /* Toda la fila 4 de RESUMEN_TIEMPOS son fórmulas que apuntan a RTE. Si el
       libro se guardó con una herramienta que no recalcula (LibreOffice, un
       script, una exportación), las celdas quedan sin valor y aquí llegarían
       ceros: una recalada sin detenciones y con el laytime inflado. Eso no
       puede pasar en silencio. */
    var sinValores = resumen && noEncontradas.length === deducciones.length && totalEmbarque === undefined;
    if(sinValores){
      avisos.push("El libro no trae los valores calculados de sus fórmulas: se guardó sin recalcular. " +
        "Ábrelo en Excel, guárdalo de nuevo y vuelve a cargarlo — si no, las horas de detención " +
        "quedan todas en cero y el laytime usado sale más alto de lo real.");
    }else if(resumen && noEncontradas.length){
      avisos.push("Categorías no halladas en RESUMEN_TIEMPOS (quedan en 0): " +
        noEncontradas.map(function(d){ return d.nombre; }).join(", ") + ".");
    }

    /* Bloque de productividad del RTE (filas ~195-201): tasas, pesómetros y
       calado. Se leen del libro en vez de recalcularse, porque la planilla
       divide por el tiempo de eventos registrados y no por el reloj. */
    var minutosReloj  = numero(valorPorUnidad(rte, "TOTAL TIEMPO DESDE INICIO EMBARQUE", "B", "C", "D", "MINUTOS", 240));
    var horasEventos  = numero(valorPorUnidad(rte, "TOTAL TIEMPO DESDE INICIO EMBARQUE", "B", "C", "D", "HORAS", 240));
    var tasaEfectiva  = numero(valorPorEtiqueta(rte, "TASA DE OPERACIÓN EFECTIVA", "B", "C", 240));
    var tasaHora      = numero(valorPorEtiqueta(rte, "TASA PROMEDIO DE EMBARQUE HORA", "B", "C", 240));
    var tasaDia       = numero(valorPorEtiqueta(rte, "TASA PROMEDIO DE EMBARQUE DÍA", "B", "C", 240));
    var pesometro08   = numero(valorPorEtiqueta(rte, "TOTAL PESÓMETRO CORREA CT-08", "K", "S", 240));
    var pesometro09   = numero(valorPorEtiqueta(rte, "TOTAL PESÓMETRO CORREA CT-09", "K", "S", 240));
    var calado        = numero(valorPorEtiqueta(rte, "CALADO", "K", "S", 240));

    /* El tonelaje que manda es el calado (draft survey); el pesómetro es el
       respaldo. La suma por bodegas (AH6) queda de último recurso. */
    var tonelaje = calado;
    var origenTonelaje = "calado";
    if(tonelaje == null){ tonelaje = pesometro09; origenTonelaje = "pesómetro CT-09"; }
    if(tonelaje == null){ tonelaje = numero(celda(rte, "AH6")); origenTonelaje = "suma por bodegas"; }

    var datos = {
      nave:            celda(rte, "D4") || celda(resumen, "S1") || "",
      codigo:          celda(rte, "Y3") || celda(resumen, "P1") || "",
      inicioEmbarque:  aInputDateTime(celda(rte, "Y1")),
      finEmbarque:     aInputDateTime(celda(rte, "Y2")),
      tonelaje:        tonelaje,
      origenTonelaje:  origenTonelaje,
      calado:          calado,
      pesometro08:     pesometro08,
      pesometro09:     pesometro09,
      tasaEfectiva:    tasaEfectiva,
      tasaHora:        tasaHora,
      tasaDia:         tasaDia,
      horasReloj:      minutosReloj != null ? minutosReloj / 60 : null,
      horasEventos:    horasEventos,
      primeraEspia:    aInputDateTime(valorPorEtiqueta(muellaje, "Fecha/Hora 1a espía", "A", "D", 30)),
      ultimaEspia:     aInputDateTime(valorPorEtiqueta(muellaje, "Fecha/Hora ultima espia", "A", "D", 30)),
      horasMantenimientoMuellaje: numero(valorPorEtiqueta(muellaje, "Tiempo Terminal en Mantenimiento", "A", "D", 30)),
      horasGira:       numero(valorPorEtiqueta(muellaje, "Tiempo Nave a la gira", "A", "D", 30)) || 0,
      eslora:          numero(valorPorEtiqueta(muellaje, "Eslora Nave", "A", "D", 30)),
      tarifaMuelle:    numero(valorPorEtiqueta(muellaje, "Tarifa muelle", "A", "D", 30)),
      horasTotales:    totalEmbarque === undefined ? null : totalEmbarque,
      horasOpEfectiva: opEfectiva === undefined ? null : opEfectiva,
      deducciones:     deducciones
    };

    /* El reloj del embarque y la suma de eventos deberían coincidir. Si no,
       hay tiempo del embarque que ningún evento del RTE cubre. */
    if(datos.horasReloj != null && datos.horasEventos != null){
      var hueco = datos.horasReloj - datos.horasEventos;
      if(Math.abs(hueco) > 0.5){
        avisos.push("Entre el inicio y el fin del embarque hay " +
          (Math.round(datos.horasReloj*100)/100).toLocaleString("es-CL") + " h de reloj, pero los eventos del RTE suman " +
          (Math.round(datos.horasEventos*100)/100).toLocaleString("es-CL") + " h: quedan " +
          (Math.round(Math.abs(hueco)*100)/100).toLocaleString("es-CL") + " h sin evento que las explique.");
      }
    }

    if(!datos.primeraEspia) avisos.push("No se pudo leer la fecha/hora de 1ª espía.");
    if(!datos.ultimaEspia)  avisos.push("No se pudo leer la fecha/hora de última espía.");

    return {datos: datos, avisos: avisos, sinValores: !!sinValores};
  }

  var api = {
    CATEGORIAS: CATEGORIAS,
    desdeLibro: desdeLibro,
    aInputDateTime: aInputDateTime,
    letra: letra,
    normalizar: normalizar
  };

  if(typeof module === "object" && module.exports) module.exports = api;
  else global.ImportarRTE = api;

})(typeof window !== "undefined" ? window : globalThis);
