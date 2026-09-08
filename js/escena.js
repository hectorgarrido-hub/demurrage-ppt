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
    tendencia:'<path d="M3 17.4l5.2-5.6 3.8 3.4 4.4-6.4 4.6 4.4"/><path d="M3 20.6h18"/>'
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

  global.Escena = {ESCENA: ESCENA, sprite: sprite, icono: icono, ICONOS: ICONOS};

})(typeof window !== "undefined" ? window : globalThis);
