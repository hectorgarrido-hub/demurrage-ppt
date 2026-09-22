/**
 * Escena de puerto y set de iconos, dibujados como SVG en línea.
 *
 * No se usan imágenes externas a propósito: la app tiene que seguir viéndose
 * igual sin conexión y detrás del firewall, y una foto pesada por encima de
 * los datos compite con ellos. Esto es una silueta, no un fondo decorativo.
 */
(function(global){
  "use strict";

  /* Banda superior: cerros de Atacama, mar, muelle y granelero en el sitio. */
  var ESCENA = '' +
  '<svg class="escena" viewBox="0 0 1600 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' +
    '<defs>' +
      '<linearGradient id="esc-cielo" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#0A1F4D"/><stop offset="100%" stop-color="#071840"/>' +
      '</linearGradient>' +
      '<linearGradient id="esc-mar" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#0C295C"/><stop offset="100%" stop-color="#061334"/>' +
      '</linearGradient>' +
      '<linearGradient id="esc-fundido" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0%" stop-color="#071840" stop-opacity="0.92"/>' +
        '<stop offset="34%" stop-color="#071840" stop-opacity="0.45"/>' +
        '<stop offset="100%" stop-color="#071840" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>' +

    '<rect width="1600" height="200" fill="url(#esc-cielo)"/>' +

    // Cordillera de la costa: dos planos, el de atrás más apagado.
    '<path d="M0,120 L120,86 L210,108 L320,64 L430,104 L520,80 L640,116 L760,92 L880,118 L1010,88 ' +
            'L1130,112 L1260,78 L1390,110 L1500,90 L1600,116 L1600,140 L0,140 Z" fill="#123566"/>' +
    '<path d="M0,132 L150,110 L260,126 L380,98 L500,124 L610,106 L740,130 L870,112 L1000,132 ' +
            'L1150,106 L1290,128 L1430,108 L1600,130 L1600,146 L0,146 Z" fill="#17417C"/>' +

    '<rect y="140" width="1600" height="60" fill="url(#esc-mar)"/>' +

    // Muelle mecanizado y cargador de barcos.
    '<g opacity="0.85">' +
      '<rect x="980" y="138" width="470" height="5" fill="#2A5FA8"/>' +
      '<rect x="1042" y="143" width="5" height="30" fill="#1D4A8F"/>' +
      '<rect x="1150" y="143" width="5" height="30" fill="#1D4A8F"/>' +
      '<rect x="1258" y="143" width="5" height="30" fill="#1D4A8F"/>' +
      '<rect x="1366" y="143" width="5" height="30" fill="#1D4A8F"/>' +
      '<path d="M1188,138 L1188,96 L1300,96 L1300,104 L1206,104 L1206,138 Z" fill="#2A63B5"/>' +
      '<path d="M1300,100 L1352,124 L1346,131 L1296,108 Z" fill="#BF5128"/>' +
      '<circle cx="1188" cy="92" r="4" fill="#D97C30"/>' +
    '</g>' +

    // Granelero atracado: casco, superestructura, escotillas y grúas.
    '<g opacity="0.95">' +
      '<path d="M300,176 L306,150 L742,150 L742,176 Q640,186 520,186 Q400,186 300,176 Z" fill="#1D4A8F"/>' +
      '<rect x="306" y="141" width="436" height="9" fill="#2A63B5"/>' +
      '<rect x="654" y="112" width="70" height="29" fill="#2A63B5"/>' +
      '<rect x="666" y="120" width="8" height="7" fill="#8FB7EE"/>' +
      '<rect x="682" y="120" width="8" height="7" fill="#8FB7EE"/>' +
      '<rect x="698" y="120" width="8" height="7" fill="#8FB7EE"/>' +
      '<rect x="700" y="96" width="7" height="16" fill="#BF5128"/>' +
      '<g fill="#3B79CC">' +
        '<rect x="336" y="132" width="52" height="9"/><rect x="410" y="132" width="52" height="9"/>' +
        '<rect x="484" y="132" width="52" height="9"/><rect x="558" y="132" width="52" height="9"/>' +
      '</g>' +
      '<path d="M400,132 L400,104 M400,104 L438,116" stroke="#2A63B5" stroke-width="5" fill="none"/>' +
      '<path d="M548,132 L548,104 M548,104 L586,116" stroke="#2A63B5" stroke-width="5" fill="none"/>' +
    '</g>' +

    // Reflejo y oleaje: trazos finos, nunca un patrón denso.
    '<g stroke="#4E8CD6" stroke-width="1.5" opacity="0.60" fill="none">' +
      '<path d="M120,164 q22,-5 44,0 t44,0"/><path d="M840,170 q22,-5 44,0 t44,0"/>' +
      '<path d="M1420,160 q22,-5 44,0 t44,0"/><path d="M60,186 q22,-5 44,0 t44,0"/>' +
      '<path d="M960,186 q22,-5 44,0 t44,0"/>' +
    '</g>' +

    '<rect width="1600" height="200" fill="url(#esc-fundido)"/>' +
  '</svg>';

  /* ─────────────────────── franjas de banda ─────────────────────
     La escena de la cabecera va sobre azul oscuro y puede ser opaca. Estas
     son para el papel claro del tablero: una silueta de un solo color, que
     la hoja tiñe con currentColor y desvanece por la izquierda para que el
     rótulo no pelee con el dibujo. Un viewBox de 1200×56 con anclaje a la
     derecha: la banda crece y el dibujo se queda pegado al borde, que es
     donde no estorba.

     Se dibujan con opacidades distintas y un solo color a propósito: con
     dos o tres colores esto deja de ser textura y pasa a ser una ilustración
     que compite con las cifras. */
  var FRANJAS = {
    /* Temporada: varias naves en fila, las de atrás más chicas y apagadas.
       Es la flota de la temporada, no una recalada.

       Los tres barcos viven en la mitad derecha del viewBox a propósito: la
       hoja desvanece la franja por la izquierda, y con el sujeto centrado
       lo único que sobrevivía al desvanecido era el oleaje. */
    flota:
      '<g opacity="0.28">' +
        '<path d="M470,40 L474,31 L556,31 L556,40 Q533,44 513,44 Q492,44 470,40 Z"/>' +
        '<rect x="536" y="24" width="15" height="7"/><rect x="498" y="27" width="5" height="4"/>' +
      '</g>' +
      '<g opacity="0.55">' +
        '<path d="M600,42 L605,29 L752,29 L752,42 Q716,48 676,48 Q636,48 600,42 Z"/>' +
        '<rect x="720" y="18" width="25" height="11"/><rect x="654" y="22" width="7" height="5"/>' +
        '<rect x="682" y="22" width="7" height="5"/>' +
      '</g>' +
      '<g opacity="0.95">' +
        '<path d="M800,45 L807,27 L1150,27 L1150,45 Q1068,53 975,53 Q882,53 800,45 Z"/>' +
        '<rect x="807" y="23" width="343" height="4"/>' +
        '<rect x="1094" y="8" width="44" height="15"/>' +
        '<rect x="880" y="14" width="10" height="9"/><rect x="940" y="14" width="10" height="9"/>' +
        '<rect x="1000" y="14" width="10" height="9"/><rect x="1058" y="14" width="10" height="9"/>' +
      '</g>' +
      /* Línea de agua y oleaje: trazos finos, nunca una trama densa. */
      '<g opacity="0.3" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M430,48 q18,-4 36,0 t36,0"/><path d="M600,52 q18,-4 36,0 t36,0"/>' +
        '<path d="M760,52 q18,-4 36,0 t36,0"/>' +
      '</g>',

    /* Recalada: una nave en el sitio, con el muelle detrás y el cargador
       con la pluma sobre la bodega. Es el embarque abierto, uno solo. */
    muelle:
      /* El muelle va detrás y más apagado: es el decorado, no el sujeto. */
      '<g opacity="0.45">' +
        '<rect x="560" y="26" width="640" height="4"/>' +
        '<rect x="620" y="30" width="4" height="10"/><rect x="742" y="30" width="4" height="10"/>' +
        '<rect x="864" y="30" width="4" height="10"/><rect x="986" y="30" width="4" height="10"/>' +
        '<rect x="1108" y="30" width="4" height="10"/>' +
      '</g>' +
      '<g opacity="0.7">' +
        '<path d="M840,26 L840,2 L928,2 L928,8 L854,8 L854,26 Z"/>' +
        '<path d="M840,6 L776,26 L780,33 L844,14 Z"/>' +
        '<circle cx="928" cy="0" r="4"/>' +
      '</g>' +
      '<g opacity="0.95">' +
        '<path d="M620,44 L628,30 L1160,30 L1160,44 Q1032,53 890,53 Q748,53 620,44 Z"/>' +
        '<rect x="628" y="26" width="532" height="4"/>' +
        '<rect x="1094" y="12" width="50" height="14"/>' +
        '<rect x="1106" y="16" width="7" height="5"/><rect x="1122" y="16" width="7" height="5"/>' +
        '<rect x="700" y="18" width="11" height="8"/><rect x="784" y="18" width="11" height="8"/>' +
        '<rect x="868" y="18" width="11" height="8"/><rect x="952" y="18" width="11" height="8"/>' +
      '</g>' +
      '<g opacity="0.28" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M470,46 q18,-4 36,0 t36,0"/><path d="M560,52 q18,-4 36,0 t36,0"/>' +
      '</g>',

    /* Clima: mar y viento, sin naves. Lo que se mira acá es si el puerto
       abre, no qué nave está. */
    mar:
      /* A diferencia de las dos anteriores, esta se reparte por todo el
         ancho: el oleaje es un patrón que se repite, así que sirve igual en
         el hueco de una banda —donde la máscara recorta los extremos— y a
         todo lo ancho del pie de la cifra del clima. */
      '<g opacity="0.5" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M40,34 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M230,46 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M430,30 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M620,44 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M830,32 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M1010,46 q22,-7 44,0 t44,0 t44,0"/>' +
        '<path d="M180,20 q22,-7 44,0 t44,0"/>' +
        '<path d="M720,18 q22,-7 44,0 t44,0"/>' +
      '</g>' +
      /* Rachas de viento: horizontales y con gancho, que es como se dibuja
         el viento sin que parezca una grilla. */
      '<g opacity="0.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<path d="M60,8 h150 a9,9 0 1 0 -9,-9"/>' +
        '<path d="M420,6 h120 a7,7 0 1 0 -7,-7"/>' +
        '<path d="M560,20 h150 a9,9 0 1 1 -9,9"/>' +
        '<path d="M900,8 h160 a9,9 0 1 0 -9,-9"/>' +
      '</g>'
  };

  /** Franja de banda lista para insertar. `tema` es una clave de FRANJAS. */
  function franja(tema){
    var d = FRANJAS[tema];
    if(!d) return "";
    return '<svg class="banda-franja" viewBox="0 0 1200 56" ' +
           'preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" ' +
           'fill="currentColor">' + d + '</svg>';
  }

  /* Iconos de 24×24, trazo de 1.6px: el mismo peso visual que el texto. */
  var ICONOS = {
    ancla:   '<circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V21M6 12H4a8 8 0 0 0 16 0h-2M8.5 10.5h7"/>',
    nave:    '<path d="M3 17.5l1.6-5.2a1 1 0 0 1 .96-.7h12.88a1 1 0 0 1 .96.7L21 17.5M6.5 11.6V7.4h11v4.2M11 7.4V4.6h2v2.8M2.6 17.5c1.9 0 1.9 2 3.8 2s1.9-2 3.8-2 1.9 2 3.8 2 1.9-2 3.8-2 1.9 2 3.8 2"/>',
    grua:    '<path d="M6 21V4.5h11M17 4.5l4 3.2M8.5 4.5v3.4M12.5 8v6.5M9.8 14.5h5.4v3.6H9.8z"/><circle cx="6" cy="3.2" r="1.2"/>',
    reloj:   '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.8V12l3.4 2.2"/>',
    ola:     '<path d="M2.6 9.5c1.9 0 1.9 2.2 3.8 2.2s1.9-2.2 3.8-2.2 1.9 2.2 3.8 2.2 1.9-2.2 3.8-2.2 1.9 2.2 3.8 2.2M2.6 15.4c1.9 0 1.9 2.2 3.8 2.2s1.9-2.2 3.8-2.2 1.9 2.2 3.8 2.2 1.9-2.2 3.8-2.2 1.9 2.2 3.8 2.2"/>',
    dolar:   '<path d="M12 2.8v18.4M16.2 7.2c-.7-1.4-2.3-2.2-4.2-2.2-2.4 0-4 1.3-4 3.1 0 4.4 8.4 2.2 8.4 6.7 0 1.9-1.8 3.3-4.4 3.3-2.1 0-3.8-.9-4.5-2.4"/>',
    balanza: '<path d="M12 4.2v15.4M7 19.6h10M4.6 8.2h14.8M4.6 8.2L2 14.4h5.2zM19.4 8.2L16.8 14.4H22zM12 4.2l4-1.2M12 4.2l-4-1.2"/>',
    tabla:   '<rect x="3.2" y="4.4" width="17.6" height="15.2" rx="1.6"/><path d="M3.2 9.4h17.6M9 9.4v10.2M3.2 14.5h17.6"/>',
    pila:    '<path d="M2.6 18.6l6-10.4 3.4 5.6 2.6-3.8 6.8 8.6z"/><circle cx="7.4" cy="5.6" r="1.8"/>',
    alerta:  '<path d="M12 3.6L1.8 20.4h20.4zM12 9.6v4.8M12 17.2v.1"/>',
    calendario:'<rect x="3.4" y="5" width="17.2" height="15" rx="1.6"/><path d="M3.4 10h17.2M8.4 3v4M15.6 3v4"/>',
    tendencia:'<path d="M3 17.4l5.2-5.6 3.8 3.4 4.4-6.4 4.6 4.4"/><path d="M3 20.6h18"/>',
    /* Los tres últimos entraron con los grupos del formulario: el charter
       party es un contrato, los festivos son un calendario con banderas y el
       despatch se pacta en porcentaje. */
    contrato:'<path d="M13.8 3H7.2A1.2 1.2 0 0 0 6 4.2v15.6A1.2 1.2 0 0 0 7.2 21h9.6a1.2 1.2 0 0 0 1.2-1.2V7.4z"/><path d="M13.8 3v4.4h4.2M9 12.4h6M9 16h4.2"/>',
    bandera: '<path d="M6 21V3.4M6 4.4h12l-2.2 3.9L18 12.2H6"/>',
    porcentaje:'<path d="M5.4 18.6L18.6 5.4"/><circle cx="7.6" cy="7.6" r="2.4"/><circle cx="16.4" cy="16.4" r="2.4"/>'
  };

  function sprite(){
    var s = '<svg class="sprite" aria-hidden="true" focusable="false"><defs>';
    Object.keys(ICONOS).forEach(function(k){
      s += '<symbol id="ico-'+k+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICONOS[k] + '</symbol>';
    });
    return s + "</defs></svg>";
  }

  /** Marca de icono lista para insertar en HTML. */
  function icono(nombre, clase){
    return '<svg class="ico '+(clase||"")+'" aria-hidden="true"><use href="#ico-'+nombre+'"></use></svg>';
  }

  global.Escena = {ESCENA: ESCENA, sprite: sprite, icono: icono, ICONOS: ICONOS,
                 franja: franja, FRANJAS: FRANJAS};

})(typeof window !== "undefined" ? window : globalThis);
