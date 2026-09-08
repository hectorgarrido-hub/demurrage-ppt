/**
 * Primitivas de gráfico en SVG para el dashboard de laytime.
 *
 * Sin librerías: todo se dibuja a mano para que la app siga funcionando
 * sin conexión. Las especificaciones de marca son fijas:
 *   - barras de 24px como máximo, extremo de dato redondeado 4px y cuadrado en la base
 *   - 2px de separación en color de superficie entre marcas que se tocan
 *   - ejes y grillas hairline sólidas, un paso sobre la superficie
 *   - el texto usa tokens de texto, nunca el color de la serie
 */
(function(global){
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var SUPERFICIE = "#33363C";   // --op-surface-1: el color que separa las marcas
  var GAP = 2;                  // separador en color de superficie
  var GROSOR_MAX = 24;

  /* ------------------------- utilidades ------------------------- */

  function el(nombre, attrs, texto){
    var n = document.createElementNS(NS, nombre);
    for(var k in attrs){ if(attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]); }
    if(texto !== undefined) n.textContent = texto;
    return n;
  }

  function lienzo(ancho, alto){
    return el("svg", {viewBox:"0 0 "+ancho+" "+alto, width:ancho, height:alto,
                      preserveAspectRatio:"xMinYMid meet", role:"img"});
  }

  /**
   * Ancho de dibujo: el del contenedor. Dibujar siempre sobre un viewBox fijo
   * y estirarlo al 100 % escala también el texto, y el mismo tamaño de fuente
   * termina distinto en cada panel.
   */
  function anchoDe(nodo, minimo){
    var w = nodo.clientWidth || nodo.parentNode && nodo.parentNode.clientWidth || 0;
    return Math.max(w || 900, minimo || 320);
  }

  function limpiar(nodo){ while(nodo.firstChild) nodo.removeChild(nodo.firstChild); }

  /**
   * Rectángulo con el extremo del dato redondeado y la base cuadrada.
   * direccion: "derecha" (crece en x) | "arriba" (crece en -y)
   */
  function marca(x, y, ancho, alto, color, direccion, radio){
    var r = Math.min(radio === undefined ? 4 : radio, direccion === "derecha" ? ancho : alto);
    if(r <= 0.5) return el("rect", {x:x, y:y, width:Math.max(ancho,0), height:Math.max(alto,0), fill:color});
    var d;
    if(direccion === "derecha"){
      d = "M"+x+","+y+" H"+(x+ancho-r)+" a"+r+","+r+" 0 0 1 "+r+","+r+
          " V"+(y+alto-r)+" a"+r+","+r+" 0 0 1 "+(-r)+","+r+" H"+x+" Z";
    }else{
      d = "M"+x+","+(y+alto)+" V"+(y+r)+" a"+r+","+r+" 0 0 1 "+r+","+(-r)+
          " H"+(x+ancho-r)+" a"+r+","+r+" 0 0 1 "+r+","+r+" V"+(y+alto)+" Z";
    }
    return el("path", {d:d, fill:color});
  }

  /* --------------------------- tooltip -------------------------- */

  function tip(){
    var t = document.getElementById("tip");
    if(!t){
      t = document.createElement("div");
      t.id = "tip";
      document.body.appendChild(t);
    }
    return t;
  }

  /** Asocia tooltip a una marca. El área de impacto es la marca completa. */
  function conTip(nodo, nombre, valor, color){
    nodo.classList.add("marca");
    nodo.setAttribute("tabindex", "0");
    var mostrar = function(ev){
      var t = tip();
      t.innerHTML = '<div class="t-nom">' +
        (color ? '<span style="width:9px;height:9px;border-radius:2px;background:'+color+';display:inline-block"></span>' : '') +
        escapar(nombre) + '</div><div class="t-val">' + escapar(valor) + '</div>';
      t.classList.add("on");
      mover(ev);
    };
    var mover = function(ev){
      var t = tip();
      var x = (ev.clientX !== undefined ? ev.clientX : nodo.getBoundingClientRect().left) + 14;
      var y = (ev.clientY !== undefined ? ev.clientY : nodo.getBoundingClientRect().top) + 14;
      var w = t.offsetWidth || 160, h = t.offsetHeight || 40;
      if(x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
      if(y + h > window.innerHeight - 8) y = y - h - 28;
      t.style.left = x + "px"; t.style.top = y + "px";
    };
    var ocultar = function(){ tip().classList.remove("on"); };
    nodo.addEventListener("mouseenter", mostrar);
    nodo.addEventListener("mousemove", mover);
    nodo.addEventListener("mouseleave", ocultar);
    nodo.addEventListener("focus", mostrar);
    nodo.addEventListener("blur", ocultar);
  }

  function escapar(t){
    return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  /** Ancho aproximado de un texto, para decidir si una etiqueta cabe dentro de la marca. */
  function anchoTexto(texto, tam){ return String(texto).length * tam * 0.56; }

  /* ------------------------ barra apilada ----------------------- */

  /**
   * Barra apilada horizontal: la línea de tiempo del embarque.
   * segmentos: [{nombre, valor, color, etiqueta}]
   * El orden recibido es el orden de apilado — es el que mantiene
   * separados los pares adyacentes bajo daltonismo, así que no se reordena.
   */
  function barraApilada(nodo, segmentos, opciones){
    opciones = opciones || {};
    limpiar(nodo);
    var total = segmentos.reduce(function(a,s){ return a + Math.max(s.valor,0); }, 0);
    if(total <= 0){ nodo.appendChild(vacio()); return; }

    var ancho = anchoDe(nodo, 360), alto = opciones.alto || 46;
    var svg = lienzo(ancho, alto);
    var x = 0;

    segmentos.forEach(function(s, i){
      var v = Math.max(s.valor, 0);
      if(v <= 0) return;
      var w = (v / total) * ancho;
      var wDibujo = Math.max(w - (i < segmentos.length - 1 ? GAP : 0), 1);
      var g = el("g", {});
      g.appendChild(el("rect", {x:x, y:0, width:wDibujo, height:alto, fill:s.color, rx:2}));

      // Etiqueta dentro del segmento solo si cabe con holgura a ambos lados.
      var texto = s.etiqueta || "";
      if(texto && anchoTexto(texto, 10.5) + 16 < wDibujo){
        g.appendChild(el("text", {x:x + wDibujo/2, y:alto/2 + 4, "text-anchor":"middle",
                                  "font-size":10.5, fill:"#12151A", "font-weight":600}, texto));
      }
      conTip(g, s.nombre, s.detalle || texto, s.color);
      svg.appendChild(g);
      x += w;
    });

    nodo.appendChild(svg);
  }

  /* ---------------------------- donut --------------------------- */

  /**
   * Donut de parte-a-todo. Máximo 6 segmentos; con menos de 3 categorías
   * conviene una cifra, no un donut.
   * segmentos: [{nombre, valor, color}]
   */
  function donut(nodo, segmentos, opciones){
    opciones = opciones || {};
    limpiar(nodo);
    var total = segmentos.reduce(function(a,s){ return a + Math.max(s.valor,0); }, 0);
    if(total <= 0){ nodo.appendChild(vacio()); return; }

    var tam = opciones.tam || 210, r = tam/2 - 6, grosor = opciones.grosor || 30;
    var cx = tam/2, cy = tam/2, rInt = r - grosor;
    var svg = lienzo(tam, tam);
    svg.setAttribute("width", tam); svg.setAttribute("height", tam);
    svg.setAttribute("style", "max-width:100%;height:auto");

    // El separador de 2px se logra recortando el ángulo de cada arco.
    var gapAng = total > 0 ? (GAP / r) : 0;
    var ang = -Math.PI/2;

    segmentos.forEach(function(s){
      var v = Math.max(s.valor, 0);
      if(v <= 0) return;
      var barrido = (v/total) * Math.PI * 2;
      var a0 = ang + gapAng/2, a1 = ang + barrido - gapAng/2;
      if(a1 > a0){
        var largo = a1 - a0 > Math.PI ? 1 : 0;
        var d = "M" + (cx + r*Math.cos(a0)) + "," + (cy + r*Math.sin(a0)) +
                " A" + r + "," + r + " 0 " + largo + " 1 " + (cx + r*Math.cos(a1)) + "," + (cy + r*Math.sin(a1)) +
                " L" + (cx + rInt*Math.cos(a1)) + "," + (cy + rInt*Math.sin(a1)) +
                " A" + rInt + "," + rInt + " 0 " + largo + " 0 " + (cx + rInt*Math.cos(a0)) + "," + (cy + rInt*Math.sin(a0)) + " Z";
        var p = el("path", {d:d, fill:s.color});
        conTip(p, s.nombre, s.detalle || (Math.round(v/total*1000)/10 + " %"), s.color);
        svg.appendChild(p);
      }
      ang += barrido;
    });

    if(opciones.centro){
      svg.appendChild(el("text", {x:cx, y:cy - 2, "text-anchor":"middle", "font-size":21,
                                  fill:"#D8DCE4", "font-weight":400}, opciones.centro));
    }
    if(opciones.centroSub){
      svg.appendChild(el("text", {x:cx, y:cy + 16, "text-anchor":"middle", "font-size":10,
                                  fill:"#6E7380"}, opciones.centroSub));
    }
    nodo.appendChild(svg);
  }

  /* -------------------------- barras Pareto --------------------- */

  /**
   * Barras horizontales ordenadas de mayor a menor.
   *
   * Deliberadamente NO lleva la curva de % acumulado encima: eso obliga a un
   * segundo eje y, cuya alineación con el primero es arbitraria y sugiere
   * correlaciones que no están en los datos. El acumulado va en la tabla de
   * ranking, que además es la vista accesible de este mismo gráfico.
   *
   * items: [{nombre, valor}] — una sola serie, por lo tanto un solo color.
   */
  function barras(nodo, items, opciones){
    opciones = opciones || {};
    limpiar(nodo);
    if(!items.length){ nodo.appendChild(vacio()); return; }

    var color = opciones.color || "#D26E4E";
    var ancho = anchoDe(nodo, 420);
    var anchoEtiq = opciones.anchoEtiqueta || Math.min(210, Math.max(120, ancho * 0.28));
    var banda = opciones.banda || 30;
    var alto = items.length * banda + 26;                 // incluye la banda del eje x
    var maxV = Math.max.apply(null, items.map(function(i){ return i.valor; }));
    if(maxV <= 0) maxV = 1;
    var x0 = anchoEtiq, anchoUtil = ancho - x0 - 58;      // deja aire para el valor en la punta
    var svg = lienzo(ancho, alto);

    // Grilla: hairline sólida, recesiva, con ticks redondos.
    var pasos = 4;
    for(var t = 0; t <= pasos; t++){
      var vx = x0 + (anchoUtil * t / pasos);
      svg.appendChild(el("line", {x1:vx, y1:0, x2:vx, y2:alto-26, class:"eje"}));
      // El primer y el último rótulo se anclan hacia adentro para que no se corten.
      var anclaje = t === 0 ? "start" : (t === pasos ? "end" : "middle");
      svg.appendChild(el("text", {x:vx, y:alto-10, "text-anchor":anclaje, class:"eje-txt"},
        opciones.fmtEje ? opciones.fmtEje(maxV * t / pasos) : (Math.round(maxV*t/pasos*10)/10)));
    }

    items.forEach(function(it, i){
      var grosor = Math.min(GROSOR_MAX, banda - 8);
      var y = i * banda + (banda - grosor)/2;
      var w = Math.max((it.valor / maxV) * anchoUtil, 2);

      var g = el("g", {});
      // Nombre de la categoría: token de texto, nunca el color de la serie.
      var maxCar = Math.max(8, Math.floor((x0 - 14) / (10.5 * 0.56)));
      var nom = it.nombre.length > maxCar ? it.nombre.slice(0, maxCar - 1) + "…" : it.nombre;
      g.appendChild(el("text", {x:x0 - 10, y:y + grosor/2 + 4, "text-anchor":"end", class:"dato-txt"}, nom));
      g.appendChild(marca(x0, y, w, grosor, color, "derecha", 4));
      // Valor en la punta de la barra.
      g.appendChild(el("text", {x:x0 + w + 8, y:y + grosor/2 + 4, class:"dato-txt"},
        opciones.fmtValor ? opciones.fmtValor(it.valor) : it.valor));
      conTip(g, it.nombre, (opciones.fmtTip || opciones.fmtValor || String)(it.valor), color);
      svg.appendChild(g);
    });

    nodo.appendChild(svg);
  }

  /* --------------------------- waterfall ------------------------ */

  /**
   * Cascada del time sheet: transcurrido → (−) exclusiones → (−) deducciones → usado.
   * pasos: [{nombre, valor, tipo:"base"|"resta"|"total"}]
   */
  function cascada(nodo, pasos, opciones){
    opciones = opciones || {};
    limpiar(nodo);
    if(!pasos.length){ nodo.appendChild(vacio()); return; }

    var ancho = anchoDe(nodo, 420), banda = 46, alto = pasos.length * banda + 8;
    var maxV = Math.max.apply(null, pasos.map(function(p){ return Math.abs(p.acumulado || p.valor); }));
    // La referencia entra en la escala: si el allowed supera el tiempo
    // transcurrido, su línea quedaría fuera del área dibujada.
    maxV = Math.max(maxV, Math.abs(opciones.referencia || 0));
    if(maxV <= 0) maxV = 1;
    var x0 = Math.min(200, Math.max(120, ancho * 0.20)), anchoUtil = ancho - x0 - 100;
    var svg = lienzo(ancho, alto);

    var acumulado = 0;
    pasos.forEach(function(p, i){
      var grosor = 22;
      var y = i * banda + (banda - grosor)/2;
      var desde, hasta;
      if(p.tipo === "base"){ desde = 0; hasta = p.valor; acumulado = p.valor; }
      else if(p.tipo === "resta"){ hasta = acumulado; acumulado = acumulado - p.valor; desde = acumulado; }
      else { desde = 0; hasta = p.valor; }

      var xA = x0 + (Math.min(desde,hasta) / maxV) * anchoUtil;
      var nulo = Math.abs(hasta - desde) < 1e-9;
      var w = nulo ? 0 : Math.max((Math.abs(hasta - desde) / maxV) * anchoUtil, 2);

      var g = el("g", {});
      g.appendChild(el("text", {x:x0 - 10, y:y + grosor/2 + 4, "text-anchor":"end", class:"dato-txt"}, p.nombre));
      if(!nulo) g.appendChild(marca(xA, y, w, grosor, p.color, "derecha", 4));
      g.appendChild(el("text", {x:x0 + anchoUtil + 10, y:y + grosor/2 + 4, class:"dato-txt"},
        opciones.fmt ? opciones.fmt(p.valor) : p.valor));
      conTip(g, p.nombre, (opciones.fmtTip || opciones.fmt || String)(p.valor), p.color);
      svg.appendChild(g);

      // Conector hasta el paso siguiente: hairline, sólido.
      if(i < pasos.length - 1 && p.tipo !== "total"){
        var xConector = x0 + (acumulado / maxV) * anchoUtil;
        svg.appendChild(el("line", {x1:xConector, y1:y + grosor, x2:xConector, y2:(i+1)*banda + (banda-grosor)/2,
                                    class:"eje"}));
      }
    });

    // Referencia del laytime permitido, si se entrega.
    if(opciones.referencia > 0){
      var xr = x0 + (opciones.referencia / maxV) * anchoUtil;
      svg.appendChild(el("line", {x1:xr, y1:0, x2:xr, y2:alto - 14, stroke:"#A4A9B4", "stroke-width":2}));
      var anclaRef = xr > ancho - 80 ? "end" : (xr < 80 ? "start" : "middle");
      svg.appendChild(el("text", {x:xr, y:alto - 2, "text-anchor":anclaRef, class:"eje-txt"},
        opciones.etiquetaReferencia || "allowed"));
    }

    nodo.appendChild(svg);
  }

  function vacio(){
    var svg = lienzo(500, 40);
    svg.appendChild(el("text", {x:14, y:24, class:"eje-txt"}, "Sin datos para graficar."));
    return svg;
  }

  global.Graficos = {
    barraApilada: barraApilada,
    donut: donut,
    barras: barras,
    cascada: cascada,
    SUPERFICIE: SUPERFICIE
  };

})(typeof window !== "undefined" ? window : globalThis);
