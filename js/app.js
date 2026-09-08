/**
 * Dashboard de laytime & demurrage — PPT.
 * Une el motor de cálculo, el lector del RTE y las primitivas de gráfico.
 */
(function(){
  "use strict";

  var L = window.Laytime, IMP = window.ImportarRTE, G = window.Graficos, FL = window.Flota;
  var CLAVE = "demurrage-ppt.v2";
  var $ = function(id){ return document.getElementById(id); };

  /* Paleta de series: validada sobre la superficie oscura del panel.
     El orden es el orden de apilado y no se altera. */
  var SERIE = {
    efectiva:      getComputedStyle(document.documentElement).getPropertyValue("--serie-efectiva").trim()      || "#52A06C",
    nocontrolable: getComputedStyle(document.documentElement).getPropertyValue("--serie-nocontrolable").trim() || "#5882CC",
    controlable:   getComputedStyle(document.documentElement).getPropertyValue("--serie-controlable").trim()   || "#D26E4E",
    neutro:        "#4F5259"
  };
  var CRITICO = "#D94040", OK = "#52A06C", TEXTO2 = "#A4A9B4";

  var flota = [];          // recaladas de la temporada

  // Las horas vienen del libro: se editan solo si el registro trae un error.
  var horasBloqueadas = true;

  var CAMPOS = ["nave","codigo","tonelaje","eslora","tarifaMuelle","nor","primeraEspia","inicioCarga",
                "finCarga","ultimaEspia","baseInicio","turnTime","baseTermino","modoPermitido","tasaDia",
                "horasFijas","modoConteo","tarifaDemurrage","porcentajeDespatch","festivos",
                "horasMantenimientoMuellaje","horasGira","horasTotales","horasOpEfectiva"];

  /* ─────────────────────────── formato ─────────────────────────── */

  function usd(v){
    return "US$ " + (Math.round(v)).toLocaleString("es-CL");
  }
  function usdExacto(v){
    return "US$ " + (Math.round(v*100)/100).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function hrs(v){ return L.horasAHm(v); }
  function hDec(v){ return (Math.round(v*100)/100).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}) + " h"; }
  function pct(v){ return (Math.round(v*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " %"; }
  function fechaLarga(d){
    if(!d) return "—";
    return d.toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}) + " " +
           String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  }
  function fh(id){ return L.parseFechaHora($(id).value); }
  function num(id){ var n = parseFloat($(id).value); return isNaN(n) ? 0 : n; }
  function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  /* ──────────────────── tabla de deducciones ───────────────────── */

  var GRUPOS = [
    {lado:"puerto", titulo:"Detenciones del terminal", responsable:"Terminal"},
    {lado:"clima",  titulo:"Clima y fuerza mayor",     responsable:"Fuerza mayor"},
    {lado:"nave",   titulo:"Tiempos de la nave",       responsable:"Nave"},
    {lado:"otro",   titulo:"Otras deducciones",        responsable:"Otro"}
  ];
  function responsableDe(lado){
    for(var i=0;i<GRUPOS.length;i++){ if(GRUPOS[i].lado === lado) return GRUPOS[i].responsable; }
    return "Otro";
  }

  function filaDeduccion(d){
    var tr = document.createElement("tr");
    tr.dataset.lado = d.lado;
    tr.dataset.mantenimiento = d.mantenimiento ? "1" : "0";
    var nombre = d.lado === "otro"
      ? '<input type="text" class="d-nombre" value="'+esc(d.nombre).replace(/"/g,"&quot;")+'" placeholder="Concepto">'
      : '<span class="d-nombre">'+esc(d.nombre)+'</span>';
    tr.innerHTML =
      '<td>'+nombre+'</td>' +
      '<td class="n"><input type="number" class="d-horas" step="0.01" min="0" value="'+(d.horas||0)+'"' +
        (horasBloqueadas && d.lado !== "otro" ? " readonly" : "") + ' style="text-align:right"></td>' +
      '<td class="n"><input type="checkbox" class="d-descuenta"'+(d.descuenta?" checked":"")+'></td>' +
      '<td class="n">'+(d.lado === "otro" ? '<button type="button" class="btn-mini" title="Eliminar">&times;</button>' : '')+'</td>';
    var quitar = tr.querySelector(".btn-mini");
    if(quitar) quitar.addEventListener("click", function(){ tr.remove(); refrescarTotal(); });
    tr.querySelector(".d-horas").addEventListener("input", refrescarTotal);
    tr.querySelector(".d-descuenta").addEventListener("change", refrescarTotal);
    return tr;
  }

  function pintarDeducciones(lista){
    var cuerpo = $("deducciones");
    cuerpo.innerHTML = "";
    GRUPOS.forEach(function(g){
      var delGrupo = lista.filter(function(d){ return (d.lado || "otro") === g.lado; });
      if(!delGrupo.length && g.lado !== "otro") return;
      var tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="4" class="label-caps" style="background:var(--op-surface-2);padding:6px 8px">'+g.titulo+'</td>';
      cuerpo.appendChild(tr);
      delGrupo.forEach(function(d){ cuerpo.appendChild(filaDeduccion(d)); });
    });
    refrescarTotal();
  }

  function leerDeducciones(){
    var lista = [];
    Array.prototype.forEach.call($("deducciones").querySelectorAll("tr"), function(tr){
      var campo = tr.querySelector(".d-nombre");
      if(!campo) return;                                   // fila de encabezado de grupo
      var nombre = campo.tagName === "INPUT" ? campo.value.trim() : campo.textContent;
      var h = parseFloat(tr.querySelector(".d-horas").value);
      lista.push({
        nombre: nombre || "(sin nombre)",
        lado: tr.dataset.lado || "otro",
        mantenimiento: tr.dataset.mantenimiento === "1",
        horas: isNaN(h) ? 0 : h,
        descuenta: tr.querySelector(".d-descuenta").checked
      });
    });
    return lista;
  }

  function refrescarTotal(){
    var t = leerDeducciones().reduce(function(a,d){ return a + (d.descuenta ? d.horas : 0); }, 0);
    $("total-deducido").textContent = hrs(t);
  }

  function porDefecto(){
    return IMP.CATEGORIAS.map(function(c){
      return {nombre:c.clave, lado:c.lado, horas:0, descuenta:c.descuenta, mantenimiento:c.mantenimiento};
    });
  }

  /* ────────────────────────── importación ──────────────────────── */

  function avisoImport(html, clase){
    $("aviso-import").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }
  function red2(v){ return Math.round(v*100)/100; }

  function aplicarImportado(r){
    var d = r.datos;
    if(d.nave)   $("nave").value = d.nave;
    if(d.codigo) $("codigo").value = d.codigo;
    if(d.tonelaje != null) $("tonelaje").value = d.tonelaje;
    if(d.eslora != null)   $("eslora").value = d.eslora;
    if(d.tarifaMuelle != null) $("tarifaMuelle").value = d.tarifaMuelle;
    if(d.primeraEspia) $("primeraEspia").value = d.primeraEspia;
    if(d.ultimaEspia)  $("ultimaEspia").value  = d.ultimaEspia;
    if(d.inicioEmbarque) $("inicioCarga").value = d.inicioEmbarque;
    if(d.finEmbarque)    $("finCarga").value    = d.finEmbarque;
    if(d.horasMantenimientoMuellaje != null) $("horasMantenimientoMuellaje").value = red2(d.horasMantenimientoMuellaje);
    if(d.horasGira != null) $("horasGira").value = red2(d.horasGira);
    if(d.horasTotales != null)    $("horasTotales").value = red2(d.horasTotales);
    if(d.horasOpEfectiva != null) $("horasOpEfectiva").value = red2(d.horasOpEfectiva);
    if(!$("nor").value && d.primeraEspia) $("nor").value = d.primeraEspia;

    var propias = leerDeducciones().filter(function(x){ return x.lado === "otro"; });
    pintarDeducciones(d.deducciones.map(function(x){
      return {nombre:x.nombre, lado:x.lado, horas:red2(x.horas), descuenta:x.descuenta, mantenimiento:x.mantenimiento};
    }).concat(propias));

    var html = "<strong>" + esc(d.nave || "Recalada") + "</strong> importada correctamente.";
    if(r.avisos.length) html += "<ul><li>" + r.avisos.map(esc).join("</li><li>") + "</li></ul>";
    avisoImport(html, r.avisos.length ? "warn" : "ok");
    verVista("dashboard");   // primero visible, luego dibujar: un panel oculto mide 0
    calcular();
  }

  function leerArchivo(archivo){
    if(!archivo) return;
    if(typeof XLSX === "undefined"){
      avisoImport("No se cargó el lector de Excel (js/vendor/xlsx.full.min.js). Ingresa los datos a mano.", "error");
      verVista("datos");
      return;
    }
    var lector = new FileReader();
    lector.onload = function(ev){
      try{
        var libro = XLSX.read(new Uint8Array(ev.target.result), {type:"array", cellDates:true});
        aplicarImportado(IMP.desdeLibro(libro));
      }catch(err){
        avisoImport("No se pudo leer el archivo: " + esc(err.message), "error");
        verVista("datos");
      }
    };
    lector.onerror = function(){ avisoImport("No se pudo abrir el archivo.", "error"); verVista("datos"); };
    lector.readAsArrayBuffer(archivo);
  }

  /* ───────────────────────────── cálculo ───────────────────────── */

  function avisos(lista, clase){
    $("avisos").innerHTML = lista.length
      ? '<div class="aviso '+(clase||"warn")+'"><ul><li>' + lista.map(esc).join("</li><li>") + "</li></ul></div>"
      : "";
  }

  function calcular(){
    var baseInicio = $("baseInicio").value;
    var inicio = L.inicioLaytime({
      base: baseInicio, nor: fh("nor"), primeraEspia: fh("primeraEspia"), turnTime: num("turnTime")
    });
    var termino = $("baseTermino").value === "ultimaEspia" ? fh("ultimaEspia") : fh("finCarga");

    var errores = [];
    if(!inicio) errores.push(baseInicio === "nor" ? "Falta la fecha/hora del NOR." : "Falta la fecha/hora de 1ª espía.");
    if(!termino) errores.push($("baseTermino").value === "ultimaEspia" ? "Falta la última espía." : "Falta el término de carguío.");
    if(inicio && termino && termino <= inicio) errores.push("El término del laytime es anterior o igual a su inicio.");

    var permitido = L.laytimePermitido({
      modo: $("modoPermitido").value, horasFijas: num("horasFijas"),
      tonelaje: num("tonelaje"), tasaDia: num("tasaDia")
    });
    if(permitido <= 0) errores.push("El laytime allowed resulta 0: revisa el tonelaje y la tasa de embarque.");

    var deduc = leerDeducciones();
    renderCabecera();
    renderResumenRecalada();
    renderComposicion(deduc);
    renderCausas(deduc);
    renderMuellaje();
    renderIndices(deduc);

    if(errores.length){
      avisos(errores, "error");
      renderVacioTimeSheet();
      guardar();
      return;
    }
    avisos([]);

    var r = L.calcularTimeSheet({
      inicio: inicio, termino: termino,
      modoConteo: $("modoConteo").value,
      festivos: L.leerFestivos($("festivos").value),
      deducciones: deduc, permitido: permitido,
      tarifaDemurrage: num("tarifaDemurrage"),
      aplicaDespatch: $("aplicaDespatch").checked,
      porcentajeDespatch: num("porcentajeDespatch")
    });

    renderHero(r);
    renderKpis(r);
    renderTimeSheet(r, inicio, termino);
    guardar();
  }

  /* ─────────────────────────── render ──────────────────────────── */

  function renderCabecera(){
    var nave = $("nave").value || "—", codigo = $("codigo").value || "—";
    $("nb-nave").textContent = nave;
    $("nb-codigo").textContent = codigo;
    $("bc-recalada").textContent = nave === "—" ? "Recalada sin cargar" : nave + " · " + codigo;
    var cargada = nave !== "—";
    $("nb-estado").textContent = cargada ? "Recalada cargada" : "Sin recalada";
    $("nb-pulse").style.background = cargada ? OK : "#6E7380";
  }

  function renderHero(r){
    var hero = $("hero");
    if(r.esDemurrage){
      hero.className = "hero demurrage";
      $("hero-lbl").textContent = "Demurrage — a pagar al armador";
      $("hero-val").textContent = usdExacto(r.montoDemurrage);
      $("hero-sub").textContent = hrs(r.horasDemurrage) + " sobre el allowed · " +
        L.horasADias(r.horasDemurrage) + " × " + usd(num("tarifaDemurrage")) + "/día";
    }else if($("aplicaDespatch").checked && r.horasDespatch > 0){
      hero.className = "hero despatch";
      $("hero-lbl").textContent = "Despatch — a favor del fletador";
      $("hero-val").textContent = usdExacto(r.montoDespatch);
      $("hero-sub").textContent = hrs(r.horasDespatch) + " ahorradas · " +
        num("porcentajeDespatch") + " % de " + usd(num("tarifaDemurrage")) + "/día";
    }else{
      hero.className = "hero neutro";
      $("hero-lbl").textContent = "Sin demurrage";
      $("hero-val").textContent = usdExacto(0);
      $("hero-sub").textContent = "La operación terminó dentro del laytime permitido.";
    }
  }

  function renderKpis(r){
    $("k-allowed").textContent = hrs(r.permitido);
    $("k-allowed-sub").textContent = L.horasADias(r.permitido) +
      ($("modoPermitido").value === "tasa" ? " · " + num("tasaDia").toLocaleString("es-CL") + " t/día" : " · horas fijas");

    $("k-usado").textContent = hrs(r.horasUsadas);
    $("k-usado-sub").textContent = "utilización " + pct(r.utilizacion);
    $("kpi-usado").style.borderTopColor = r.balance < 0 ? CRITICO : "var(--op-border-subtle)";

    $("k-balance").textContent = (r.balance < 0 ? "" : "+") + hrs(r.balance);
    $("k-balance").style.color = r.balance < 0 ? CRITICO : OK;
    $("k-balance-sub").textContent = r.balance < 0 ? "sobre el allowed" : "dentro del allowed";
    $("kpi-balance").style.borderTopColor = r.balance < 0 ? CRITICO : OK;
  }

  /** Donut de composición del tiempo: efectiva → no controlable → controlable. */
  function renderComposicion(deduc){
    var total = num("horasTotales");
    var efectiva = num("horasOpEfectiva");
    var controlable = suma(deduc, function(d){ return d.lado === "puerto"; });
    var noControlable = suma(deduc, function(d){ return d.lado === "clima" || d.lado === "nave"; });
    var resto = total - efectiva - controlable - noControlable;

    var segmentos = [
      {nombre:"Operación efectiva", valor:efectiva,      color:SERIE.efectiva},
      {nombre:"Detención no controlable", valor:noControlable, color:SERIE.nocontrolable},
      {nombre:"Detención controlable",    valor:controlable,   color:SERIE.controlable}
    ];
    if(resto > 0.05) segmentos.push({nombre:"Resto sin clasificar", valor:resto, color:SERIE.neutro});

    var suma_ = segmentos.reduce(function(a,s){ return a + s.valor; }, 0);
    segmentos.forEach(function(s){ s.detalle = hDec(s.valor) + " · " + pct(suma_ ? s.valor/suma_*100 : 0); });

    G.donut($("g-donut"), segmentos, {
      tam: 200, grosor: 30,
      centro: suma_ ? hDec(suma_).replace(" h","") : "—",
      centroSub: "horas totales"
    });

    $("ley-donut").innerHTML = segmentos.map(function(s){
      return '<div class="ley-item" style="justify-content:space-between;width:100%">' +
        '<span style="display:flex;align-items:center;gap:7px">' +
        '<span class="ley-sw" style="background:'+s.color+'"></span>' + esc(s.nombre) + '</span>' +
        '<span class="tabular text-2">' + hDec(s.valor) + '</span></div>';
    }).join("");

    var detenciones = controlable + noControlable;
    $("donut-nota").textContent = detenciones > 0
      ? pct(controlable / detenciones * 100) + " de las detenciones es controlable"
      : "";
  }

  /** Barras ordenadas + tabla de ranking con acumulado. */
  function renderCausas(deduc){
    var items = deduc.filter(function(d){ return d.horas > 0.001; })
      .map(function(d){ return {nombre:d.nombre, valor:d.horas, lado:d.lado}; })
      .sort(function(a,b){ return b.valor - a.valor; });

    G.barras($("g-pareto"), items.slice(0, 12), {
      color: SERIE.controlable,
      banda: 28,
      fmtValor: function(v){ return (Math.round(v*100)/100).toLocaleString("es-CL"); },
      fmtTip: function(v){ return hDec(v); },
      fmtEje: function(v){ return Math.round(v*10)/10; }
    });

    var total = items.reduce(function(a,i){ return a + i.valor; }, 0);
    var acum = 0;
    $("tb-ranking").innerHTML = items.length ? items.map(function(it, i){
      acum += it.valor;
      return "<tr><td class='rank'>"+(i+1)+"</td><td>"+esc(it.nombre)+"</td>" +
             "<td class='text-2'>"+responsableDe(it.lado)+"</td>" +
             "<td class='n'>"+hDec(it.valor)+"</td>" +
             "<td class='n'>"+pct(total ? it.valor/total*100 : 0)+"</td>" +
             "<td class='n text-2'>"+pct(total ? acum/total*100 : 0)+"</td></tr>";
    }).join("") : "<tr><td colspan='6' class='text-3'>Sin detenciones registradas.</td></tr>";
  }

  function renderTimeSheet(r, inicio, termino){
    var pasos = [
      {nombre:"Tiempo transcurrido", valor:r.horasTranscurridas, tipo:"base",  color:SERIE.nocontrolable},
      {nombre:"(−) Régimen de conteo", valor:r.horasExcluidas,   tipo:"resta", color:SERIE.neutro},
      {nombre:"(−) Deducciones",       valor:r.horasDeducidas,   tipo:"resta", color:SERIE.neutro},
      {nombre:"Laytime usado",         valor:r.horasUsadas,      tipo:"total",
       color: r.balance < 0 ? CRITICO : SERIE.efectiva}
    ];
    G.cascada($("g-cascada"), pasos, {
      fmt: function(v){ return hDec(v); },
      referencia: r.permitido,
      etiquetaReferencia: "allowed " + hDec(r.permitido)
    });
    $("cascada-nota").textContent = fechaLarga(inicio) + "  →  " + fechaLarga(termino) +
      "  ·  " + $("modoConteo").value;
    $("ley-cascada").innerHTML =
      '<div class="ley-item"><span class="ley-sw" style="background:'+SERIE.nocontrolable+'"></span>Tiempo transcurrido</div>' +
      '<div class="ley-item"><span class="ley-sw" style="background:'+SERIE.neutro+'"></span>Tiempo que no cuenta</div>' +
      '<div class="ley-item"><span class="ley-sw" style="background:'+(r.balance<0?CRITICO:SERIE.efectiva)+'"></span>Laytime usado</div>' +
      '<div class="ley-item"><span style="width:11px;height:2px;background:'+TEXTO2+';display:inline-block"></span>Laytime allowed</div>';
  }

  function renderVacioTimeSheet(){
    ["k-allowed","k-usado","k-balance"].forEach(function(id){ $(id).textContent = "—"; });
    ["k-allowed-sub","k-usado-sub","k-balance-sub"].forEach(function(id){ $(id).innerHTML = "&nbsp;"; });
    $("hero").className = "hero neutro";
    $("hero-lbl").textContent = "Resultado del laytime";
    $("hero-val").textContent = "—";
    $("hero-sub").textContent = "Completa los hitos en «Datos y contrato».";
    $("g-cascada").innerHTML = "";
    $("ley-cascada").innerHTML = "";
    $("cascada-nota").innerHTML = "&nbsp;";
  }

  function renderMuellaje(){
    var m = L.calcularMuellaje({
      primeraEspia: fh("primeraEspia"), ultimaEspia: fh("ultimaEspia"),
      horasMantenimiento: num("horasMantenimientoMuellaje"), horasGira: num("horasGira"),
      eslora: num("eslora"), tarifa: num("tarifaMuelle")
    });
    $("m-tiempo").textContent = m.horasMuellaje ? hDec(m.horasMuellaje) : "—";
    $("m-descuentos").textContent = hDec(m.descuentos);
    $("m-nwh").textContent = hDec(m.nwh);
    $("m-base").textContent = num("eslora").toLocaleString("es-CL") + " m × " + num("tarifaMuelle") + " US$/m/h";
    $("m-monto").textContent = m.horasMuellaje ? usdExacto(m.monto) : "—";
    $("k-muellaje").textContent = m.horasMuellaje ? usd(m.monto) : "—";
    $("k-muellaje-sub").textContent = m.horasMuellaje ? "NWH " + hDec(m.nwh) : " ";
  }

  function renderIndices(deduc){
    var mantenimiento = suma(deduc, function(d){ return d.mantenimiento; });
    var reserva = suma(deduc, function(d){ return d.lado === "nave"; });
    var i = L.indices({
      horasTotales: num("horasTotales"), horasMantenimiento: mantenimiento,
      horasReserva: reserva, horasOperacionEfectiva: num("horasOpEfectiva")
    });
    var hay = num("horasTotales") > 0;

    medidor("df", hay ? i.df : null, hay ? "disponibles " + hDec(i.disponibles) + " de " + hDec(num("horasTotales")) : "");
    medidor("u",  hay ? i.u  : null, hay ? "operativas " + hDec(i.operativas) + " de " + hDec(i.disponibles) : "");
    medidor("fo", hay ? i.fo : null, hay ? "efectiva " + hDec(num("horasOpEfectiva")) + " de " + hDec(i.operativas) : "");
  }

  /** La pista del medidor es un paso más claro del mismo color de la barra. */
  function medidor(clave, valor, sub){
    var v = valor === null ? 0 : valor;
    var color = v >= 90 ? OK : v >= 70 ? "#D97C30" : CRITICO;
    $("i-"+clave).textContent = valor === null ? "—" : pct(v);
    $("i-"+clave).style.color = valor === null ? "var(--op-text-1)" : color;
    $("i-"+clave+"-bar").style.width = Math.max(0, Math.min(100, v)) + "%";
    $("i-"+clave+"-bar").style.background = color;
    $("i-"+clave+"-sub").textContent = sub || " ";
  }

  function suma(lista, filtro){
    return lista.filter(filtro).reduce(function(a,d){ return a + d.horas; }, 0);
  }

  /* ─────────────────────────── flota ───────────────────────────── */

  /** Toma los campos actuales del formulario tal como están. */
  function camposActuales(){
    var c = {};
    CAMPOS.forEach(function(id){ c[id] = $(id).value; });
    c.aplicaDespatch = $("aplicaDespatch").checked;
    return c;
  }

  /** Campos de una recalada importada, con el charter party que esté puesto. */
  function camposDesdeImportacion(d){
    var c = camposActuales();
    c.nave = d.nave || "";
    c.codigo = d.codigo || "";
    if(d.tonelaje != null) c.tonelaje = String(d.tonelaje);
    if(d.eslora != null) c.eslora = String(d.eslora);
    if(d.tarifaMuelle != null) c.tarifaMuelle = String(d.tarifaMuelle);
    c.primeraEspia = d.primeraEspia || "";
    c.ultimaEspia = d.ultimaEspia || "";
    c.inicioCarga = d.inicioEmbarque || "";
    c.finCarga = d.finEmbarque || "";
    c.horasMantenimientoMuellaje = String(red2(d.horasMantenimientoMuellaje || 0));
    c.horasGira = String(red2(d.horasGira || 0));
    c.horasTotales = String(red2(d.horasTotales || 0));
    c.horasOpEfectiva = String(red2(d.horasOpEfectiva || 0));
    c.nor = d.primeraEspia || "";        // el NOR no está en el RTE
    return c;
  }

  function avisoFlota(html, clase){
    $("flota-aviso").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  function agregarAFlota(campos, deducciones){
    flota = FL.agregar(flota, {campos: campos, deducciones: deducciones});
    if(!FL.guardar(flota)){
      avisoFlota("No se pudo guardar la temporada en este navegador (almacenamiento bloqueado). " +
                 "Los datos se ven ahora pero se pierden al cerrar.", "warn");
    }
    renderFlota();
  }

  function renderFlota(){
    var calc = flota.map(FL.calcular);
    var t = FL.agregado(calc);

    $("flota-nota").textContent = t.recaladas
      ? t.recaladas + (t.recaladas === 1 ? " recalada" : " recaladas")
      : "sin recaladas";
    $("f-recaladas").textContent = t.recaladas;
    $("f-recaladas-sub").textContent = t.recaladas
      ? t.conDemurrage + " en demurrage · " + t.conDespatch + " en despatch" +
        (t.sinTimeSheet ? " · " + t.sinTimeSheet + " sin hitos" : "")
      : " ";
    $("f-tonelaje").textContent = t.tonelaje ? Math.round(t.tonelaje).toLocaleString("es-CL") : "—";
    $("f-muellaje").textContent = t.muellaje ? usd(t.muellaje) : "—";
    $("f-controlable").textContent = t.detenciones ? pct(t.pctControlable) : "—";
    $("f-controlable-sub").textContent = t.detenciones
      ? hDec(t.controlable) + " de " + hDec(t.detenciones) + " detenidas" : " ";

    $("f-neto").textContent = t.recaladas ? usd(Math.abs(t.neto)) : "—";
    $("f-neto").style.color = t.neto > 0 ? CRITICO : (t.neto < 0 ? OK : "var(--op-text-1)");
    $("f-neto-sub").textContent = t.recaladas
      ? (t.neto > 0 ? "a pagar · " + usd(t.demurrage) + " menos " + usd(t.despatch)
                    : t.neto < 0 ? "a favor · despatch supera al demurrage" : "sin diferencias")
      : " ";
    $("kpi-f-neto").style.borderTopColor = t.neto > 0 ? CRITICO : (t.neto < 0 ? OK : "var(--op-border-subtle)");

    renderGantt(calc);
    renderDivergentes(calc);
    G.barras($("g-causas-flota"), t.listaCausas.slice(0, 12).map(function(c){
      return {nombre:c.nombre, valor:c.horas};
    }), {
      color: SERIE.controlable, banda: 26,
      fmtValor: function(v){ return (Math.round(v*10)/10).toLocaleString("es-CL"); },
      fmtTip: function(v){ return hDec(v); },
      fmtEje: function(v){ return Math.round(v); }
    });
    renderTablaFlota(calc);
  }

  function renderGantt(calc){
    var filas = calc.filter(function(r){ return r.hitos.primeraEspia && r.hitos.ultimaEspia; })
      .map(function(r){
        var h = r.hitos;
        return {
          nombre: r.nave,
          segmentos: [
            {nombre:"Espera desde el NOR", desde:h.nor, hasta:h.primeraEspia,
             color:SERIE.nocontrolable, detalle:duracion(h.nor, h.primeraEspia)},
            {nombre:"Amarre a inicio de carguío", desde:h.primeraEspia, hasta:h.inicioCarga,
             color:SERIE.neutro, detalle:duracion(h.primeraEspia, h.inicioCarga)},
            {nombre:"Carguío", desde:h.inicioCarga, hasta:h.finCarga,
             color:SERIE.efectiva, detalle:duracion(h.inicioCarga, h.finCarga)},
            {nombre:"Remate y desatraque", desde:h.finCarga, hasta:h.ultimaEspia,
             color:SERIE.neutro, detalle:duracion(h.finCarga, h.ultimaEspia)}
          ].filter(function(s){ return s.desde && s.hasta && s.hasta > s.desde; })
        };
      });

    G.gantt($("g-gantt"), filas, {banda: 30});

    // La leyenda solo nombra los tramos que realmente se dibujaron: prometer
    // tres colores y mostrar uno confunde más que no poner leyenda.
    var presentes = {};
    filas.forEach(function(f){ f.segmentos.forEach(function(sg){ presentes[sg.nombre] = sg.color; }); });
    var nombres = Object.keys(presentes);
    $("ley-gantt").innerHTML = nombres.length > 1 ? nombres.map(function(n){
      return '<div class="ley-item"><span class="ley-sw" style="background:'+presentes[n]+'"></span>'+esc(n)+'</div>';
    }).join("") : "";

    // Cuántas traen un NOR de verdad: sin él no hay espera que mostrar.
    var conNor = calc.filter(function(r){
      return r.hitos.nor && r.hitos.primeraEspia && r.hitos.nor < r.hitos.primeraEspia;
    }).length;
    if(!filas.length){
      $("gantt-nota").textContent = "faltan hitos para dibujar la estadía";
    }else if(conNor === filas.length){
      $("gantt-nota").textContent = filas.length + " naves · espera medida desde el NOR";
    }else{
      $("gantt-nota").textContent = filas.length + " naves · " + (filas.length - conNor) +
        " sin NOR propio (se asume igual a la 1ª espía, así que no muestran espera)";
    }
  }

  function duracion(a, b){
    if(!a || !b || b <= a) return "";
    return hDec((b - a) / 3600000);
  }

  function renderDivergentes(calc){
    var items = calc.map(function(r){
      var v = 0, detalle = "sin hitos para el time sheet";
      if(r.ts){
        v = r.ts.esDemurrage ? r.ts.montoDemurrage : -r.ts.montoDespatch;
        detalle = r.ts.esDemurrage
          ? "demurrage · " + hrs(r.ts.horasDemurrage) + " sobre el allowed"
          : (r.ts.montoDespatch > 0 ? "despatch · " + hrs(r.ts.horasDespatch) + " ahorradas" : "dentro del allowed");
      }
      return {nombre:r.nave, valor:v, detalle:detalle};
    });
    G.divergentes($("g-divergentes"), items, {
      banda: 30,
      colorDemurrage: CRITICO, colorDespatch: OK,
      fmt: function(v){ return usd(Math.abs(v)); }
    });
  }

  function renderTablaFlota(calc){
    if(!calc.length){
      $("tb-flota").innerHTML = "<tr><td colspan='10' class='text-3'>Todavía no hay recaladas en la temporada.</td></tr>";
      return;
    }
    $("tb-flota").innerHTML = calc.map(function(r){
      var ts = r.ts;
      var resultado = !ts ? "<span class='text-3'>sin hitos</span>"
        : ts.esDemurrage
          ? "<span style='color:"+CRITICO+"'>−" + usd(ts.montoDemurrage) + "</span>"
          : (ts.montoDespatch > 0 ? "<span style='color:"+OK+"'>+" + usd(ts.montoDespatch) + "</span>" : "—");
      return "<tr>" +
        "<td>" + esc(r.nave) + "</td>" +
        "<td class='text-2'>" + esc(r.codigo || "—") + "</td>" +
        "<td class='n'>" + (r.tonelaje ? Math.round(r.tonelaje).toLocaleString("es-CL") : "—") + "</td>" +
        "<td class='text-2'>" + (r.hitos.primeraEspia ? fechaLarga(r.hitos.primeraEspia) : "—") + "</td>" +
        "<td class='n'>" + (r.permitido ? hrs(r.permitido) : "—") + "</td>" +
        "<td class='n'>" + (ts ? hrs(ts.horasUsadas) : "—") + "</td>" +
        "<td class='n' style='color:" + (ts && ts.balance < 0 ? CRITICO : OK) + "'>" +
          (ts ? (ts.balance < 0 ? "" : "+") + hrs(ts.balance) : "—") + "</td>" +
        "<td class='n'>" + resultado + "</td>" +
        "<td class='n'>" + usd(r.muellaje.monto) + "</td>" +
        "<td class='n'><button class='btn' type='button' data-abrir='" + r.id + "' " +
          "style='padding:3px 9px'>Abrir</button> " +
          "<button class='btn-mini' type='button' data-quitar='" + r.id + "' title='Quitar'>&times;</button></td>" +
        "</tr>";
    }).join("");

    Array.prototype.forEach.call($("tb-flota").querySelectorAll("[data-abrir]"), function(b){
      b.addEventListener("click", function(){ abrirRecalada(b.dataset.abrir); });
    });
    Array.prototype.forEach.call($("tb-flota").querySelectorAll("[data-quitar]"), function(b){
      b.addEventListener("click", function(){
        var reg = buscar(b.dataset.quitar);
        if(!confirm("Quitar " + (reg ? reg.campos.nave : "esta recalada") + " de la temporada?")) return;
        flota = FL.eliminar(flota, b.dataset.quitar);
        FL.guardar(flota);
        renderFlota();
      });
    });
  }

  function buscar(id){
    for(var i=0;i<flota.length;i++){ if(flota[i].id === id) return flota[i]; }
    return null;
  }

  /** Carga una recalada de la temporada en el formulario y va al dashboard. */
  function abrirRecalada(id){
    var reg = buscar(id);
    if(!reg) return;
    CAMPOS.forEach(function(k){ if(typeof reg.campos[k] === "string") $(k).value = reg.campos[k]; });
    $("aplicaDespatch").checked = reg.campos.aplicaDespatch !== false;
    pintarDeducciones(reg.deducciones || porDefecto());
    alternarPermitido();
    verVista("dashboard");
    calcular();
  }

  /* ─────────────── resumen de lo importado (solo lectura) ──────── */

  function fechaCorta(id){
    var d = fh(id);
    return d ? fechaLarga(d) : "—";
  }

  function renderResumenRecalada(){
    var filas = [
      ["Nave",                $("nave").value || "—"],
      ["Código de embarque",  $("codigo").value || "—"],
      ["Tonelaje",            num("tonelaje") ? num("tonelaje").toLocaleString("es-CL") + " t" : "—"],
      ["Eslora",              num("eslora") ? num("eslora").toLocaleString("es-CL") + " m" : "—"],
      ["Tarifa de muelle",    num("tarifaMuelle")
        ? num("tarifaMuelle").toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:2}) + " US$/m/h" : "—"],
      ["1ª espía",            fechaCorta("primeraEspia")],
      ["Última espía",        fechaCorta("ultimaEspia")],
      ["Inicio de carguío",   fechaCorta("inicioCarga")],
      ["Término de carguío",  fechaCorta("finCarga")],
      ["Total embarque",      num("horasTotales") ? hDec(num("horasTotales")) : "—"],
      ["Operación efectiva",  num("horasOpEfectiva") ? hDec(num("horasOpEfectiva")) : "—"],
      ["Mtto. terminal (muellaje)", hDec(num("horasMantenimientoMuellaje"))],
      ["Nave a la gira",      hDec(num("horasGira"))]
    ];
    $("recalada-resumen").innerHTML = "<tbody>" + filas.map(function(f){
      return "<tr><td class='text-2'>" + f[0] + "</td><td class='n'>" + esc(f[1]) + "</td></tr>";
    }).join("") + "</tbody>";

    $("recalada-origen").textContent = $("nave").value
      ? "importada del registro de tiempos"
      : "sin datos importados";
  }

  /* ────────────────────────── persistencia ─────────────────────── */

  function guardar(){
    try{
      var datos = {deducciones: leerDeducciones(), aplicaDespatch: $("aplicaDespatch").checked};
      CAMPOS.forEach(function(id){ datos[id] = $(id).value; });
      localStorage.setItem(CLAVE, JSON.stringify(datos));
    }catch(e){ /* almacenamiento bloqueado */ }
  }

  function restaurar(){
    var datos = null;
    try{ datos = JSON.parse(localStorage.getItem(CLAVE) || "null"); }catch(e){ datos = null; }
    if(!datos){ pintarDeducciones(porDefecto()); return false; }
    CAMPOS.forEach(function(id){ if(typeof datos[id] === "string") $(id).value = datos[id]; });
    if(typeof datos.aplicaDespatch === "boolean") $("aplicaDespatch").checked = datos.aplicaDespatch;
    pintarDeducciones(datos.deducciones && datos.deducciones.length ? datos.deducciones : porDefecto());
    return true;
  }

  /* ──────────────────────────── vistas ─────────────────────────── */

  function verVista(cual){
    $("vista-dashboard").hidden = cual !== "dashboard";
    $("vista-datos").hidden = cual !== "datos";
    $("vista-flota").hidden = cual !== "flota";
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){
      t.classList.toggle("on", t.dataset.vista === cual);
    });
    window.scrollTo(0, 0);
  }

  function alternarPermitido(){
    var porTasa = $("modoPermitido").value === "tasa";
    $("campo-tasa").hidden = !porTasa;
    $("campo-horas").hidden = porTasa;
  }

  /* ─────────────────────────── eventos ─────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){
    t.addEventListener("click", function(){
      verVista(t.dataset.vista);
      // Los gráficos se miden contra el panel: hay que dibujar ya visible.
      if(t.dataset.vista === "dashboard") calcular();
      if(t.dataset.vista === "flota") renderFlota();
    });
  });
  $("btn-cargar").addEventListener("click", function(){ $("archivo").click(); });
  $("archivo").addEventListener("change", function(e){ leerArchivo(e.target.files[0]); });
  $("btn-imprimir").addEventListener("click", function(){ window.print(); });
  $("btn-calcular").addEventListener("click", function(){ verVista("dashboard"); calcular(); });
  $("modoPermitido").addEventListener("change", function(){ alternarPermitido(); calcular(); });
  $("btn-corregir").addEventListener("click", function(){
    var editor = $("recalada-editor");
    editor.hidden = !editor.hidden;
    $("btn-corregir").textContent = editor.hidden ? "Corregir datos importados" : "Ocultar edición";
  });

  $("btn-editar-horas").addEventListener("click", function(){
    horasBloqueadas = !horasBloqueadas;
    $("btn-editar-horas").textContent = horasBloqueadas ? "Corregir horas" : "Bloquear horas";
    pintarDeducciones(leerDeducciones());
  });

  $("btn-agregar").addEventListener("click", function(){
    var lista = leerDeducciones();
    lista.push({nombre:"", lado:"otro", horas:0, descuenta:true});
    pintarDeducciones(lista);
  });
  $("btn-limpiar").addEventListener("click", function(){
    if(!confirm("Se borrarán todos los datos ingresados. ¿Continuar?")) return;
    try{ localStorage.removeItem(CLAVE); }catch(e){}
    location.reload();
  });

  $("btn-flota-agregar").addEventListener("click", function(){
    if(!$("nave").value && !$("codigo").value){
      avisoFlota("Primero carga un registro de tiempos: no hay recalada que agregar.", "warn");
      return;
    }
    agregarAFlota(camposActuales(), leerDeducciones());
    avisoFlota("<strong>" + esc($("nave").value || $("codigo").value) + "</strong> agregada a la temporada.", "ok");
  });

  $("btn-flota-varios").addEventListener("click", function(){ $("archivos").click(); });

  $("archivos").addEventListener("change", function(e){
    var archivos = Array.prototype.slice.call(e.target.files || []);
    if(!archivos.length) return;
    if(typeof XLSX === "undefined"){
      avisoFlota("No se cargó el lector de Excel: no se pueden leer los libros.", "error");
      return;
    }
    var listos = 0, fallidos = [], reparos = [], pendientes = archivos.length;

    archivos.forEach(function(archivo){
      var lector = new FileReader();
      lector.onload = function(ev){
        try{
          var libro = XLSX.read(new Uint8Array(ev.target.result), {type:"array", cellDates:true});
          var r = IMP.desdeLibro(libro);
          var deduc = r.datos.deducciones.map(function(x){
            return {nombre:x.nombre, lado:x.lado, horas:red2(x.horas),
                    descuenta:x.descuenta, mantenimiento:x.mantenimiento};
          });
          flota = FL.agregar(flota, {campos: camposDesdeImportacion(r.datos), deducciones: deduc});
          listos++;
          // Los avisos de cada libro no se pierden en la carga masiva.
          if(r.sinValores){
            reparos.push(archivo.name + ": el libro se guardó sin recalcular, sus horas de detención llegaron vacías.");
          }else if(r.avisos.length){
            reparos.push(archivo.name + ": " + r.avisos.join(" "));
          }
        }catch(err){
          fallidos.push(archivo.name + ": " + err.message);
        }
        if(--pendientes === 0) terminar();
      };
      lector.onerror = function(){
        fallidos.push(archivo.name + ": no se pudo abrir");
        if(--pendientes === 0) terminar();
      };
      lector.readAsArrayBuffer(archivo);
    });

    function terminar(){
      FL.guardar(flota);
      renderFlota();
      var html = listos + (listos === 1 ? " recalada agregada" : " recaladas agregadas") + ".";
      var problemas = fallidos.concat(reparos);
      if(problemas.length) html += "<ul><li>" + problemas.map(esc).join("</li><li>") + "</li></ul>";
      avisoFlota(html, problemas.length ? "warn" : "ok");
      e.target.value = "";      // permite volver a cargar los mismos archivos
    }
  });

  $("btn-flota-vaciar").addEventListener("click", function(){
    if(!flota.length) return;
    if(!confirm("Se quitarán las " + flota.length + " recaladas de la temporada. ¿Continuar?")) return;
    flota = [];
    FL.guardar(flota);
    renderFlota();
    avisoFlota("Temporada vaciada.", "info");
  });

  var soltar = $("soltar");
  soltar.addEventListener("click", function(){ $("archivo").click(); });
  soltar.addEventListener("dragover", function(e){ e.preventDefault(); soltar.classList.add("encima"); });
  soltar.addEventListener("dragleave", function(){ soltar.classList.remove("encima"); });
  soltar.addEventListener("drop", function(e){
    e.preventDefault(); soltar.classList.remove("encima");
    if(e.dataTransfer.files && e.dataTransfer.files.length) leerArchivo(e.dataTransfer.files[0]);
  });
  document.addEventListener("keydown", function(e){
    if(e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON"){
      e.preventDefault(); calcular();
    }
  });

  // Los gráficos se dibujan al ancho real del panel, así que hay que
  // redibujarlos cuando cambia el tamaño de la ventana.
  var temporizador = null;
  window.addEventListener("resize", function(){
    clearTimeout(temporizador);
    temporizador = setTimeout(function(){
      if(!$("vista-dashboard").hidden) calcular();
      if(!$("vista-flota").hidden) renderFlota();
    }, 180);
  });

  /* ────────────────────────── arranque ─────────────────────────── */

  flota = FL.cargar();
  var habia = restaurar();
  alternarPermitido();
  if(habia){
    calcular();
  }else{
    renderCabecera();
    renderResumenRecalada();
    renderComposicion(leerDeducciones());
    renderCausas(leerDeducciones());
    renderMuellaje();
    renderIndices(leerDeducciones());
    renderVacioTimeSheet();
    verVista("datos");
  }
})();
