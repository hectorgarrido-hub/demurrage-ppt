/**
 * Modo presentación: convierte la recalada en láminas para proyectar.
 *
 * El tablero está dimensionado para una pantalla a 60 cm; proyectado en una
 * sala a cuatro metros no se lee. Aquí cada lámina dice una sola cosa, con
 * tipografía de proyección, y se navega con las flechas.
 *
 * Al imprimir, cada lámina es una página: la misma vista sirve para el PDF.
 */
(function(global){
  "use strict";

  var G = null, L = null, LEC = null;   // se inyectan al abrir
  var laminas = [], actual = 0, contexto = null;

  function el(tag, clase, html){
    var n = document.createElement(tag);
    if(clase) n.className = clase;
    if(html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(t){
    return String(t == null ? "" : t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function usd(v){ return "US$ " + Math.round(Math.abs(v)).toLocaleString("es-CL"); }
  function pct(v){ return (Math.round(v*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " %"; }
  function ico(nombre){ return '<svg class="ico" aria-hidden="true"><use href="#ico-'+nombre+'"></use></svg>'; }

  /* ─────────────────────────── láminas ─────────────────────────── */

  function laminaPortada(c){
    var n = el("section", "lamina lamina-portada");
    var est = LEC.estado(c);
    n.appendChild(el("div", "lam-semaforo sem-" + est.nivel,
      '<span class="sem-punto"></span><span>' + esc(est.titulo) + '</span>'));

    n.appendChild(el("div", "lam-nave", esc(c.nave || "—") +
      '<span class="lam-codigo">' + esc(c.codigo || "") + '</span>'));

    var resultado = el("div", "lam-hero");
    if(c.ts && c.ts.esDemurrage){
      resultado.className = "lam-hero es-demurrage";
      resultado.innerHTML = '<div class="lam-hero-rot">Demurrage a pagar al armador</div>' +
        '<div class="lam-hero-val">' + usd(c.ts.montoDemurrage) + '</div>';
    }else if(c.ts && c.ts.montoDespatch > 0){
      resultado.className = "lam-hero es-despatch";
      resultado.innerHTML = '<div class="lam-hero-rot">Despatch a favor del fletador</div>' +
        '<div class="lam-hero-val">' + usd(c.ts.montoDespatch) + '</div>';
    }else{
      resultado.innerHTML = '<div class="lam-hero-rot">Resultado del laytime</div>' +
        '<div class="lam-hero-val">' + usd(0) + '</div>';
    }
    n.appendChild(resultado);

    var lectura = el("div", "lam-lectura");
    LEC.parrafos(c).forEach(function(p){ lectura.appendChild(el("p", null, esc(p))); });
    n.appendChild(lectura);
    return n;
  }

  function laminaCosto(c){
    var n = el("section", "lamina");
    n.appendChild(el("h2", "lam-titulo", ico("dolar") + "Cómo se llega a la cifra"));
    n.appendChild(el("p", "lam-bajada",
      "Cada hora vale " + usd((c.tarifaDia || 0)/24) + ": el mismo rate diario del contrato. " +
      "Así se ve cuánto descontó cada excepción."));

    var caja = el("div", "lam-grafico");
    n.appendChild(caja);
    n.appendChild(cintaKpis([
      ["Laytime permitido", c.ts ? horasCorto(c.ts.permitido) : "—", "reloj"],
      ["Laytime usado", c.ts ? horasCorto(c.ts.horasUsadas) : "—", "balanza"],
      ["Balance", c.ts ? (c.ts.balance < 0 ? "−" : "+") + horasCorto(Math.abs(c.ts.balance)) : "—", "tendencia"]
    ], c.ts && c.ts.balance < 0 ? "critico" : "ok"));

    n.dibujar = function(){
      var pasos = LEC.cascadaDinero(c.ts, c.tarifaDia).map(function(p){
        return {nombre:p.nombre, valor:p.valor, tipo:p.tipo,
                color: p.tipo === "total" ? (c.ts.esDemurrage ? c.color.critico : c.color.ok)
                     : p.tipo === "resta" ? c.color.neutro : c.color.nocontrolable};
      });
      G.cascada(caja, pasos, {fmt: usd, banda: 64, grosor: 34, tamTexto: 15,
                              anchoEtiqueta: 300, margenValor: 150});
    };
    return n;
  }

  function laminaDetenciones(c){
    var n = el("section", "lamina");
    n.appendChild(el("h2", "lam-titulo", ico("alerta") + "Dónde se fue el tiempo"));
    var det = (c.controlable || 0) + (c.noControlable || 0);
    n.appendChild(el("p", "lam-bajada", det > 0
      ? pct(c.controlable / det * 100) + " de las " + horasCorto(det) + " detenidas depende del terminal."
      : "Sin detenciones registradas."));

    var fila = el("div", "lam-dos");
    var izq = el("div", "lam-grafico"), der = el("div", "lam-grafico");
    fila.appendChild(izq); fila.appendChild(der);
    n.appendChild(fila);

    n.dibujar = function(){
      G.donut(izq, [
        {nombre:"Operación efectiva", valor:c.opEfectiva, color:c.color.efectiva},
        {nombre:"No controlable", valor:c.noControlable, color:c.color.nocontrolable},
        {nombre:"Controlable", valor:c.controlable, color:c.color.controlable}
      ], {tam: 260, grosor: 40, centro: det > 0 ? pct(c.controlable/det*100).replace(" %","") : "—",
          centroSub: "controlable"});
      G.barras(der, (c.causas || []).slice(0, 6), {
        color: c.color.controlable, banda: 44, tamTexto: 15, anchoEtiqueta: 300,
        fmtValor: function(v){ return (Math.round(v*10)/10).toLocaleString("es-CL") + " h"; },
        fmtEje: function(v){ return Math.round(v); }
      });
    };
    return n;
  }

  function laminaEstadia(c){
    var n = el("section", "lamina");
    n.appendChild(el("h2", "lam-titulo", ico("grua") + "La estadía completa"));
    n.appendChild(el("p", "lam-bajada", c.esperaDias > 0
      ? "La nave esperó " + (Math.round(c.esperaDias*10)/10).toLocaleString("es-CL") +
        " días entre el NOR y el amarre."
      : "Sin NOR cargado: no se puede medir la espera."));
    var caja = el("div", "lam-grafico");
    n.appendChild(caja);
    n.appendChild(cintaKpis([
      ["Arribo al puerto", c.hitosTexto.arribo, "ola"],
      ["NOR presentado", c.hitosTexto.nor, "calendario"],
      ["Amarre", c.hitosTexto.primeraEspia, "ancla"],
      ["Término de carguío", c.hitosTexto.finCarga, "grua"]
    ]));
    n.dibujar = function(){
      G.gantt(caja, [{nombre: c.nave || "Recalada", segmentos: c.segmentosEstadia}],
              {banda: 64, tamTexto: 15});
    };
    return n;
  }

  function laminaProductividad(c){
    var n = el("section", "lamina");
    n.appendChild(el("h2", "lam-titulo", ico("pila") + "Productividad del embarque"));
    n.appendChild(el("p", "lam-bajada", c.tasaDia && c.tasaPactada
      ? "Promedió " + Math.round(c.tasaDia).toLocaleString("es-CL") + " t/día contra las " +
        Math.round(c.tasaPactada).toLocaleString("es-CL") + " t/día pactadas."
      : "Tasas tomadas del registro de tiempos."));

    n.appendChild(cintaKpis([
      ["Tonelaje embarcado", c.tonelaje ? Math.round(c.tonelaje).toLocaleString("es-CL") + " t" : "—", "pila"],
      ["Tasa de operación efectiva", c.tasaEfectiva ? Math.round(c.tasaEfectiva).toLocaleString("es-CL") + " t/h" : "—", "grua"],
      ["Tasa promedio diaria", c.tasaDia ? Math.round(c.tasaDia).toLocaleString("es-CL") + " t/día" : "—", "tendencia"],
      ["Muellaje", c.muellaje ? usd(c.muellaje) : "—", "dolar"]
    ]));

    var indices = el("div", "lam-indices");
    [["DF", "Disponibilidad física", c.indices.df],
     ["U", "Utilización", c.indices.u],
     ["FO", "Factor operacional", c.indices.fo]].forEach(function(i){
      var color = i[2] >= 90 ? c.color.ok : i[2] >= 70 ? c.color.aviso : c.color.critico;
      indices.appendChild(el("div", "lam-indice",
        '<div class="lam-ind-val" style="color:'+color+'">' + pct(i[2]) + '</div>' +
        '<div class="lam-ind-nom"><strong>' + i[0] + '</strong> · ' + i[1] + '</div>' +
        '<div class="lam-ind-pista"><span style="width:' + Math.min(100, i[2]) + '%;background:' + color + '"></span></div>'));
    });
    n.appendChild(indices);
    return n;
  }

  function laminaTemporada(c){
    var n = el("section", "lamina");
    n.appendChild(el("h2", "lam-titulo", ico("nave") + "La temporada"));
    n.appendChild(el("p", "lam-bajada", c.flota.recaladas + " recaladas · " +
      c.flota.conDemurrage + " con demurrage · " + c.flota.conDespatch + " con despatch"));
    n.appendChild(cintaKpis([
      ["Tonelaje", Math.round(c.flota.tonelaje).toLocaleString("es-CL") + " t", "pila"],
      ["Demurrage neto", usd(c.flota.neto), "dolar"],
      ["Muellaje", usd(c.flota.muellaje), "balanza"],
      ["% controlable", pct(c.flota.pctControlable), "alerta"]
    ], c.flota.neto > 0 ? "critico" : "ok"));
    var caja = el("div", "lam-grafico");
    n.appendChild(caja);
    n.dibujar = function(){
      G.divergentes(caja, c.flota.porNave, {
        banda: 52, colorDemurrage: c.color.critico, colorDespatch: c.color.ok, fmt: usd
      });
    };
    return n;
  }

  /* ───────────────────────── utilidades ────────────────────────── */

  function cintaKpis(items, tono){
    var n = el("div", "lam-kpis" + (tono ? " tono-" + tono : ""));
    items.forEach(function(i){
      n.appendChild(el("div", "lam-kpi",
        (i[2] ? '<div class="lam-kpi-ico">' + ico(i[2]) + '</div>' : "") +
        '<div class="lam-kpi-lbl">' + esc(i[0]) + '</div>' +
        '<div class="lam-kpi-val">' + esc(i[1]) + '</div>'));
    });
    return n;
  }

  function horasCorto(h){
    var e = Math.floor(Math.abs(h) + 1e-9), m = Math.round((Math.abs(h) - e) * 60);
    if(m === 60){ e++; m = 0; }
    return e + "h " + String(m).padStart(2,"0");
  }

  /* ────────────────────────── navegación ───────────────────────── */

  function mostrar(i){
    if(!laminas.length) return;
    actual = Math.max(0, Math.min(laminas.length - 1, i));
    laminas.forEach(function(l, n){ l.hidden = n !== actual; });
    var pastillas = document.querySelectorAll("#pres-pasos .paso");
    Array.prototype.forEach.call(pastillas, function(p, n){ p.classList.toggle("on", n === actual); });
    document.getElementById("pres-indice").textContent = (actual + 1) + " / " + laminas.length;
    // Los gráficos se miden contra su contenedor: dibujar recién visible.
    if(typeof laminas[actual].dibujar === "function") laminas[actual].dibujar();
  }

  function teclado(ev){
    if(document.getElementById("presentacion").hidden) return;
    if(ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " "){ ev.preventDefault(); mostrar(actual + 1); }
    else if(ev.key === "ArrowLeft" || ev.key === "PageUp"){ ev.preventDefault(); mostrar(actual - 1); }
    else if(ev.key === "Home"){ mostrar(0); }
    else if(ev.key === "End"){ mostrar(laminas.length - 1); }
    else if(ev.key === "Escape"){ cerrar(); }
  }

  function abrir(ctx, deps){
    G = deps.G; L = deps.L; LEC = deps.LEC;
    contexto = ctx;

    var cont = document.getElementById("pres-laminas");
    cont.innerHTML = "";
    laminas = [laminaPortada(ctx), laminaCosto(ctx), laminaDetenciones(ctx), laminaEstadia(ctx),
               laminaProductividad(ctx)];
    if(ctx.flota && ctx.flota.recaladas > 1) laminas.push(laminaTemporada(ctx));
    laminas.forEach(function(l){ cont.appendChild(l); });

    var pasos = document.getElementById("pres-pasos");
    pasos.innerHTML = "";
    laminas.forEach(function(l, i){
      var p = el("button", "paso");
      p.type = "button";
      p.setAttribute("aria-label", "Lámina " + (i+1));
      p.addEventListener("click", function(){ mostrar(i); });
      pasos.appendChild(p);
    });

    document.getElementById("presentacion").hidden = false;
    document.body.classList.add("en-presentacion");
    mostrar(0);
    var raiz = document.documentElement;
    if(raiz.requestFullscreen) raiz.requestFullscreen().catch(function(){ /* el navegador puede negarlo */ });
  }

  function cerrar(){
    document.getElementById("presentacion").hidden = true;
    document.body.classList.remove("en-presentacion");
    if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){});
  }

  function iniciar(){
    document.addEventListener("keydown", teclado);
    window.addEventListener("resize", function(){
      if(!document.getElementById("presentacion").hidden) mostrar(actual);
    });
  }

  global.Presentacion = {abrir: abrir, cerrar: cerrar, iniciar: iniciar, mostrar: mostrar};

})(typeof window !== "undefined" ? window : globalThis);
