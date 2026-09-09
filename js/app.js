/**
 * Dashboard de laytime & demurrage — PPT.
 * Une el motor de cálculo, el lector del RTE y las primitivas de gráfico.
 */
(function(){
  "use strict";

  var L = window.Laytime, IMP = window.ImportarRTE, G = window.Graficos, FL = window.Flota, NOR = window.LeerNOR, LEC = window.Lectura, PRES = window.Presentacion, NUBE = window.Nube, CLIMA = window.Clima;
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
  var AVISO = "#D9A441";   // diferencia que hay que mirar, no falla

  var flota = [];          // recaladas de la temporada
  var ultimoTimeSheet = null;

  // Las horas vienen del libro: se editan solo si el registro trae un error.
  var horasBloqueadas = true;

  var CAMPOS = ["nave","codigo","tonelaje","eslora","tarifaMuelle",
                "eta","arribo","nor","norAceptado","freePratique","primeraEspia","inicioCarga",
                "finCarga","ultimaEspia","baseInicio","turnTime","baseTermino","modoPermitido","tasaDia",
                "horasFijas","modoConteo","tarifaDemurrage","porcentajeDespatch","festivos",
                "horasMantenimientoMuellaje","horasGira","horasTotales","horasOpEfectiva",
                // valores propios del RTE: no se editan, pero se guardan y viajan a la temporada
                "rteCalado","rtePesometro08","rtePesometro09","rteTasaEfectiva","rteTasaHora",
                "rteTasaDia","rteHorasReloj","rteOrigenTonelaje"];

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

    /* Si el libro es de otro embarque, los hitos de la agencia del anterior no
       pueden quedarse: el NOR define desde cuándo corre el laytime, y heredarlo
       de otra nave cambia el demurrage sin que se note. */
    var codigoNuevo = (d.codigo || "").trim().toUpperCase();
    var codigoActual = $("codigo").value.trim().toUpperCase();
    if(codigoNuevo && codigoActual && codigoNuevo !== codigoActual){
      ["eta","arribo","nor","norAceptado","freePratique"].forEach(function(k){ $(k).value = ""; });
      avisoNor("");
      $("baseInicio").value = "amarre";
    }
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
    [["calado","rteCalado"], ["pesometro08","rtePesometro08"], ["pesometro09","rtePesometro09"],
     ["tasaEfectiva","rteTasaEfectiva"], ["tasaHora","rteTasaHora"], ["tasaDia","rteTasaDia"],
     ["horasReloj","rteHorasReloj"]
    ].forEach(function(par){ $(par[1]).value = d[par[0]] == null ? "" : d[par[0]]; });
    $("rteOrigenTonelaje").value = d.origenTonelaje || "";
    // El NOR ya no se rellena con la 1ª espía: inventarlo cambia el demurrage
    // en silencio. Si falta, el laytime arranca en el amarre y se avisa.
    if(!$("nor").value) $("baseInicio").value = "amarre";

    var propias = leerDeducciones().filter(function(x){ return x.lado === "otro"; });
    pintarDeducciones(d.deducciones.map(function(x){
      return {nombre:x.nombre, lado:x.lado, horas:red2(x.horas), descuenta:x.descuenta, mantenimiento:x.mantenimiento};
    }).concat(propias));

    var html = "<strong>" + esc(d.nave || "Recalada") + "</strong> importada correctamente.";
    if(r.avisos.length) html += "<ul><li>" + r.avisos.map(esc).join("</li><li>") + "</li></ul>";
    avisoImport(html, r.avisos.length ? "warn" : "ok");
    verVista("dashboard");   // primero visible, luego dibujar: un panel oculto mide 0
    calcular();
    plegarRecaladaSegunEstado();
    autoguardar();
  }

  function leerArchivo(archivo){
    if(!archivo) return;
    if(typeof XLSX === "undefined"){
      avisoImport("No se cargó el lector de Excel (js/vendor/xlsx.full.min.js). Ingresa los datos a mano.", "error");
      enfocarRecalada();
      return;
    }
    var lector = new FileReader();
    lector.onload = function(ev){
      try{
        var libro = XLSX.read(new Uint8Array(ev.target.result), {type:"array", cellDates:true});
        aplicarImportado(IMP.desdeLibro(libro));
      }catch(err){
        avisoImport("No se pudo leer el archivo: " + esc(err.message), "error");
        enfocarRecalada();
      }
    };
    lector.onerror = function(){ avisoImport("No se pudo abrir el archivo.", "error"); enfocarRecalada(); };
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
      base: baseInicio, nor: fh("nor"), norAceptado: fh("norAceptado"),
      primeraEspia: fh("primeraEspia"), turnTime: num("turnTime")
    });
    var termino = $("baseTermino").value === "ultimaEspia" ? fh("ultimaEspia") : fh("finCarga");

    var errores = [];
    if(!inicio){
      errores.push(baseInicio === "nor" ? "Falta la fecha/hora del NOR presentado."
        : baseInicio === "norAceptado" ? "Falta la fecha/hora del NOR aceptado."
        : "Falta la fecha/hora de 1ª espía.");
    }
    if(!termino) errores.push($("baseTermino").value === "ultimaEspia" ? "Falta la última espía." : "Falta el término de carguío.");
    if(inicio && termino && termino <= inicio) errores.push("El término del laytime es anterior o igual a su inicio.");

    var permitido = L.laytimePermitido({
      modo: $("modoPermitido").value, horasFijas: num("horasFijas"),
      tonelaje: num("tonelaje"), tasaDia: num("tasaDia")
    });
    if(permitido <= 0){
      errores.push(($("modoPermitido").value === "tasa" && !num("tonelaje"))
        ? "Falta el tonelaje embarcado: sin él no hay laytime allowed que calcular."
        : "El laytime allowed resulta 0: revisa el tonelaje y la tasa de embarque.");
    }

    var deduc = leerDeducciones();
    renderCabecera();
    renderResumenRecalada();
    renderProductividad();
    renderComposicion(deduc);
    renderCausas(deduc);
    renderMuellaje();
    renderIndices(deduc);

    if(errores.length){
      avisos(errores, "error");
      renderVacioTimeSheet(errores);
      ultimoTimeSheet = null;
      renderVeredicto(contexto(null));
      G.cascada($("g-cascada-usd"), [], {});
      $("cascada-usd-nota").innerHTML = "&nbsp;";
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
    ultimoTimeSheet = r;
    var ctx = contexto(r);
    renderVeredicto(ctx);
    renderCascadaDinero(ctx);
    guardar();
    autoguardar();      // el embarque queda en el historial sin pedirlo
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

    renderEspera();

    $("k-balance").textContent = (r.balance < 0 ? "" : "+") + hrs(r.balance);
    $("k-balance").style.color = r.balance < 0 ? CRITICO : OK;
    $("k-balance-sub").textContent = r.balance < 0 ? "sobre el allowed" : "dentro del allowed";
    $("kpi-balance").style.borderTopColor = r.balance < 0 ? CRITICO : OK;
  }

  /**
   * Productividad: se muestra lo que trae el RTE, no un recálculo.
   * La planilla divide por el tiempo de eventos registrados (131,55 h en la
   * CNN-EMB-434) y no por el reloj del embarque (138,15 h); recalcularlo por
   * fuera daría un número distinto al que la operación ya reporta.
   */
  function renderProductividad(){
    var mil = function(n){ return Math.round(n).toLocaleString("es-CL"); };
    var ton    = num("tonelaje");
    var calado = num("rteCalado");
    var p09    = num("rtePesometro09");
    var p08    = num("rtePesometro08");
    var reloj = num("rteHorasReloj"), eventos = num("horasTotales");

    /* ── Tonelaje: tres cifras distintas, no una sola con notas al pie ──
       El pesómetro mide lo que pasó por la correa; el calado es lo que la
       nave declara haber recibido. Que difieran es normal; cuánto difieren
       es lo que hay que mirar, y por eso va escrito. */
    $("p-pesometro").textContent = p09 ? mil(p09) : "—";
    $("p-pesometro-sub").textContent = !p09 ? "no viene en el libro"
      : (p08 ? "CT-08 " + mil(p08) + " TM" : "CT-08 sin registro");

    $("p-calado").textContent = calado ? mil(calado) : "—";
    if(calado && p09){
      var dif = calado - p09, pctDif = dif / p09 * 100;
      $("p-calado-sub").textContent = (dif >= 0 ? "+" : "") + mil(dif) + " TM (" +
        (dif >= 0 ? "+" : "") + pct(pctDif) + ") contra el pesómetro";
      // Media unidad porcentual entre correa y draft survey ya es diferencia a explicar.
      $("p-calado-sub").style.color = Math.abs(pctDif) > 0.5 ? AVISO : "";
    }else{
      $("p-calado-sub").textContent = calado ? "sin pesómetro con que contrastar" : "no viene en el libro";
      $("p-calado-sub").style.color = "";
    }

    $("p-tonelaje").textContent = ton ? mil(ton) : "—";
    var origen = $("rteOrigenTonelaje").value;
    $("p-tonelaje-sub").textContent = !ton ? "carga el registro de tiempos"
      : "el que alimenta el laytime allowed" + (origen ? " · según " + origen : "");

    /* ── Tasas: del RTE si vienen; si no, calculadas y dicho en pantalla ──
       Antes quedaban en blanco sin explicación y parecía un defecto. */
    var tasaEf = num("rteTasaEfectiva"), tasaH = num("rteTasaHora"), tasaD = num("rteTasaDia");
    var calculadas = false;
    if(!tasaH && !tasaD){
      var c = L.tasasCalculadas({tonelaje: ton, horasEmbarque: eventos});
      if(c.tasaHora){ tasaH = c.tasaHora; tasaD = c.tasaDia; calculadas = true; }
    }

    $("p-tasa-efectiva").textContent = tasaEf ? mil(tasaEf) : "—";
    $("p-tasa-efectiva-sub").textContent = tasaEf
      ? "sobre operación efectiva y cambio de turno"
      : "solo la entrega el RTE: no se puede deducir de las horas de la app";

    $("p-tasa-hora").textContent = tasaH ? mil(tasaH) : "—";
    $("p-tasa-hora-sub").textContent = !tasaH ? "&nbsp;"
      : (calculadas ? "calculada sobre " : "sobre ") + hDec(eventos) + " de embarque";

    $("p-tasa-dia").textContent = tasaD ? mil(tasaD) : "—";

    // Contra la tasa pactada en el charter party, que es la que define el allowed.
    var pactada = $("modoPermitido").value === "tasa" ? num("tasaDia") : 0;
    if(tasaD && pactada){
      var d = (tasaD - pactada) / pactada * 100;
      $("p-tasa-dia-sub").textContent = (d >= 0 ? "+" : "") + pct(d) +
        " contra la tasa pactada de " + mil(pactada);
      $("p-tasa-dia").style.color = d >= 0 ? OK : CRITICO;
    }else{
      $("p-tasa-dia-sub").textContent = tasaD ? (calculadas ? "calculada" : "reportada por el RTE") : " ";
      $("p-tasa-dia").style.color = "";
    }

    $("p-aviso").innerHTML = (reloj && eventos && Math.abs(reloj - eventos) > 0.5)
      ? '<div class="aviso warn">' + esc("El reloj del embarque marca " + hDec(reloj) +
          " y los eventos del RTE suman " + hDec(eventos) + ": hay " + hDec(Math.abs(reloj - eventos)) +
          " sin evento que las explique. Las tasas se calculan sobre las " +
          hDec(eventos) + ".") + "</div>"
      : "";
    $("prod-nota").textContent = calculadas
      ? "el libro no trae el bloque de tasas: calculadas por la app"
      : (tasaD ? "tomada del registro de tiempos, no recalculada" : "sin datos de productividad");
  }

  /**
   * Todo lo que el veredicto y las láminas necesitan, en un solo objeto.
   * Se arma de los mismos campos que ya alimentan el dashboard.
   */
  function contexto(r){
    var deduc = leerDeducciones();
    var causas = deduc.filter(function(d){ return d.horas > 0.001; })
      .map(function(d){ return {nombre:d.nombre, valor:d.horas, lado:d.lado}; })
      .sort(function(a,b){ return b.valor - a.valor; });
    var mantenimiento = suma(deduc, function(d){ return d.mantenimiento; });
    var reserva = suma(deduc, function(d){ return d.lado === "nave"; });
    var m = L.calcularMuellaje({
      primeraEspia: fh("primeraEspia"), ultimaEspia: fh("ultimaEspia"),
      horasMantenimiento: num("horasMantenimientoMuellaje"), horasGira: num("horasGira"),
      eslora: num("eslora"), tarifa: num("tarifaMuelle")
    });
    var nor = fh("nor"), espia = fh("primeraEspia"), aceptado = fh("norAceptado");
    var h = {eta: fh("eta"), arribo: fh("arribo"), nor: nor, primeraEspia: espia,
             inicioCarga: fh("inicioCarga"), finCarga: fh("finCarga"), ultimaEspia: fh("ultimaEspia")};

    var calc = flota.map(FL.calcular);
    var agr = FL.agregado(calc);

    return {
      nave: $("nave").value, codigo: $("codigo").value,
      ts: r || null,
      tarifaDia: num("tarifaDemurrage"),
      controlable: suma(deduc, function(d){ return d.lado === "puerto"; }),
      noControlable: suma(deduc, function(d){ return d.lado === "clima" || d.lado === "nave"; }),
      opEfectiva: num("horasOpEfectiva"),
      causas: causas.map(function(c){ return {nombre:c.nombre, valor:c.valor}; }),
      causaMayor: causas.length ? {nombre:causas[0].nombre, horas:causas[0].valor} : null,
      esperaDias: (nor && espia && espia > nor) ? L.diasEntre(nor, espia) : 0,
      norAceptadoTexto: aceptado ? fechaLarga(aceptado) : "",
      tonelaje: num("tonelaje"), tasaDia: num("rteTasaDia"),
      tasaEfectiva: num("rteTasaEfectiva"),
      tasaPactada: $("modoPermitido").value === "tasa" ? num("tasaDia") : 0,
      muellaje: m.monto,
      indices: L.indices({horasTotales: num("horasTotales"), horasMantenimiento: mantenimiento,
                          horasReserva: reserva, horasOperacionEfectiva: num("horasOpEfectiva")}),
      hitos: h,
      hitosTexto: {
        arribo: h.arribo ? fechaLarga(h.arribo) : "—",
        nor: nor ? fechaLarga(nor) : "—",
        primeraEspia: espia ? fechaLarga(espia) : "—",
        finCarga: h.finCarga ? fechaLarga(h.finCarga) : "—"
      },
      segmentosEstadia: [
        {nombre:"ETA hasta el NOR", desde:h.eta, hasta:nor, color:SERIE.neutro},
        {nombre:"Espera desde el NOR", desde:nor, hasta:espia, color:SERIE.nocontrolable},
        {nombre:"Amarre a inicio de carguío", desde:espia, hasta:h.inicioCarga, color:SERIE.neutro},
        {nombre:"Carguío", desde:h.inicioCarga, hasta:h.finCarga, color:SERIE.efectiva},
        {nombre:"Remate y desatraque", desde:h.finCarga, hasta:h.ultimaEspia, color:SERIE.neutro}
      ].filter(function(sg){ return sg.desde && sg.hasta && sg.hasta > sg.desde; }),
      color: {efectiva:SERIE.efectiva, nocontrolable:SERIE.nocontrolable, controlable:SERIE.controlable,
              neutro:SERIE.neutro, critico:CRITICO, ok:OK, aviso:"#D97C30"},
      flota: {
        recaladas: agr.recaladas, conDemurrage: agr.conDemurrage, conDespatch: agr.conDespatch,
        tonelaje: agr.tonelaje, neto: agr.neto, muellaje: agr.muellaje, pctControlable: agr.pctControlable,
        porNave: calc.map(function(x){
          return {nombre: x.nave,
                  valor: x.ts ? (x.ts.esDemurrage ? x.ts.montoDemurrage : -x.ts.montoDespatch) : 0};
        })
      }
    };
  }

  /** Semáforo y lectura sobre el dashboard. */
  function renderVeredicto(ctx){
    var e = LEC.estado(ctx);
    $("veredicto-sem").className = "lam-semaforo sem-" + e.nivel;
    $("veredicto-titulo").textContent = e.titulo;
    $("panel-veredicto").className = "panel " +
      (e.nivel === "critico" ? "acento-rojo" : e.nivel === "atencion" ? "acento-hematita" : "acento-verde");
    var frases = LEC.parrafos(ctx);
    $("veredicto-lectura").innerHTML = frases.length
      ? frases.map(function(f){ return "<p style='margin-bottom:6px'>" + esc(f) + "</p>"; }).join("")
      : "<p class='text-3'>Carga un registro de tiempos para ver la lectura de la recalada.</p>";
  }

  /** La misma cascada del time sheet, valorizada al rate del contrato. */
  function renderCascadaDinero(ctx){
    var pasos = LEC.cascadaDinero(ctx.ts, ctx.tarifaDia).map(function(p){
      return {nombre:p.nombre, valor:p.valor, tipo:p.tipo,
              color: p.tipo === "total" ? (ctx.ts.esDemurrage ? CRITICO : OK)
                   : p.tipo === "resta" ? SERIE.neutro : SERIE.nocontrolable};
    });
    G.cascada($("g-cascada-usd"), pasos, {fmt: function(v){ return usd(v); }});
    $("cascada-usd-nota").textContent = ctx.tarifaDia
      ? "cada hora vale " + usd(ctx.tarifaDia/24) + " al rate de " + usd(ctx.tarifaDia) + "/día"
      : "falta el demurrage rate";
  }

  /** Espera entre el NOR presentado y el amarre: los días que la nave estuvo a la gira. */
  function renderEspera(){
    var nor = fh("nor"), espia = fh("primeraEspia");
    if(!nor || !espia || espia <= nor){
      $("k-espera").textContent = "—";
      $("k-espera-sub").textContent = nor ? "el amarre no es posterior al NOR" : "sin NOR de la agencia";
      $("kpi-espera").style.borderTopColor = "var(--op-border-subtle)";
      return;
    }
    var dias = L.diasEntre(nor, espia);
    $("k-espera").textContent = (Math.round(dias*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " d";
    var aceptado = fh("norAceptado");
    $("k-espera-sub").textContent = hrs(dias*24) + (aceptado ? " · NOR aceptado " + fechaLarga(aceptado) : "");
    $("kpi-espera").style.borderTopColor = dias >= 7 ? CRITICO : dias >= 3 ? "#D97C30" : OK;
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

  function renderVacioTimeSheet(faltantes){
    ["k-allowed","k-usado","k-balance","k-espera"].forEach(function(id){ $(id).textContent = "—"; });
    ["k-allowed-sub","k-usado-sub","k-balance-sub","k-espera-sub"].forEach(function(id){ $(id).innerHTML = "&nbsp;"; });
    $("hero").className = "hero neutro";
    $("hero-lbl").textContent = "Resultado del laytime";
    $("hero-val").textContent = "—";
    // Antes decía «Datos y contrato», una pestaña que ya no existe, y no
    // nombraba lo que faltaba: el usuario quedaba con un guion y sin pista.
    $("hero-sub").textContent = (faltantes && faltantes.length)
      ? faltantes[0] + (faltantes.length > 1 ? " (y " + (faltantes.length - 1) + " dato más)" : "")
      : "Carga el registro de tiempos en el bloque «Recalada».";
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

  /* ──────────────── Notice of Readiness (PDF) ──────────────────── */

  function avisoNor(html, clase){
    $("aviso-nor").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  /**
   * Los hitos leídos se escriben en los campos pero NO se calcula solo: un
   * dígito mal leído aquí son decenas de miles de dólares, así que primero
   * se muestra qué se leyó para que la persona lo compare con el papel.
   */
  function aplicarNor(r, nombreArchivo){
    var puestos = [];
    [["arribo","arribo","Arribo al puerto"],
     ["norPresentado","nor","NOR presentado"],
     ["freePratique","freePratique","Free pratique"],
     ["norAceptado","norAceptado","NOR aceptado"]].forEach(function(par){
      if(r[par[0]]){
        $(par[1]).value = r[par[0]];
        puestos.push("<strong>" + par[2] + ":</strong> " + r[par[0]].replace("T", " "));
      }
    });

    if(!puestos.length){
      avisoNor("No se pudo leer ningún hito de " + esc(nombreArchivo) + ".<ul><li>" +
        r.avisos.map(esc).join("</li><li>") + "</li></ul>", "error");
      return;
    }

    var html = "Leído de <strong>" + esc(nombreArchivo) + "</strong>" +
      (r.nave ? " · nave <strong>" + esc(r.nave) + "</strong>" : "") +
      (r.viaje ? " · viaje " + esc(r.viaje) : "") +
      "<br>" + puestos.join(" &nbsp;·&nbsp; ") +
      "<br><em>Compáralos con el documento antes de calcular.</em>";

    var reparos = r.avisos.slice();
    // La nave del NOR y la del registro de tiempos deberían ser la misma.
    if(r.nave && $("nave").value){
      var p = NOR.parecido(r.nave, $("nave").value);
      if(p < 0.75){
        reparos.push("El NOR es de " + r.nave + " y la recalada cargada es " + $("nave").value +
          ": revisa que sean el mismo embarque.");
      }else if(p < 1){
        reparos.push("El nombre difiere entre documentos: el NOR dice " + r.nave +
          " y el registro de tiempos dice " + $("nave").value + ". Parece un error de tipeo en la planilla.");
      }
    }
    if(reparos.length) html += "<ul><li>" + reparos.map(esc).join("</li><li>") + "</li></ul>";
    avisoNor(html, reparos.length ? "warn" : "ok");

    // Con NOR a la vista, el inicio por defecto deja de ser el amarre.
    if($("baseInicio").value === "amarre" && r.norPresentado) $("baseInicio").value = "nor";
  }

  function leerPdfNor(archivo){
    if(!archivo) return;
    avisoNor("Leyendo " + esc(archivo.name) + "…", "info");
    var lector = new FileReader();
    lector.onload = function(ev){
      NOR.desdeArchivo(ev.target.result)
        .then(function(r){ aplicarNor(r, archivo.name); })
        .catch(function(err){ avisoNor("No se pudo leer el PDF: " + esc(err.message), "error"); });
    };
    lector.onerror = function(){ avisoNor("No se pudo abrir el archivo.", "error"); };
    lector.readAsArrayBuffer(archivo);
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
    // El NOR, el ETA y el free pratique no están en el RTE: vienen del
    // documento de la agencia. Se dejan como estén en el formulario.

    /* Los valores propios del RTE también son de esta recalada: si no se
       sobrescriben, la nave importada hereda las tasas de la que esté
       cargada en el formulario. */
    c.rteCalado       = d.calado == null ? "" : String(d.calado);
    c.rtePesometro08  = d.pesometro08 == null ? "" : String(d.pesometro08);
    c.rtePesometro09  = d.pesometro09 == null ? "" : String(d.pesometro09);
    c.rteTasaEfectiva = d.tasaEfectiva == null ? "" : String(d.tasaEfectiva);
    c.rteTasaHora     = d.tasaHora == null ? "" : String(d.tasaHora);
    c.rteTasaDia      = d.tasaDia == null ? "" : String(d.tasaDia);
    c.rteHorasReloj   = d.horasReloj == null ? "" : String(d.horasReloj);
    c.rteOrigenTonelaje = d.origenTonelaje || "";
    return c;
  }

  function avisoFlota(html, clase){
    $("flota-aviso").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  function agregarAFlota(campos, deducciones){
    var registro = {campos: campos, deducciones: deducciones, actualizadoEn: new Date().toISOString()};
    flota = FL.agregar(flota, registro);
    NUBE.guardar(registro, L).then(pintarEstadoNube);
    refrescarSelector();
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
    renderTendencias(calc);
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
            {nombre:"ETA hasta el NOR", desde:h.eta, hasta:h.nor,
             color:SERIE.neutro, detalle:duracion(h.eta, h.nor)},
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

  /** Nombre corto de la nave para el eje: "MN CHINA TRIUMPH" → "CHINA TRIUMPH". */
  function naveCorta(nombre){
    return String(nombre).replace(/^MN\s+/i, "").trim();
  }

  /**
   * Curvas de la temporada. Dos gráficos separados y no uno con dos ejes:
   * t/día y % no comparten escala, y superponerlos inventaría una relación
   * que los datos no tienen.
   */
  function renderTendencias(calc){
    var conCarga = calc.filter(function(r){
      return r.hitos.inicioCarga && r.hitos.finCarga && r.hitos.finCarga > r.hitos.inicioCarga && r.tonelaje > 0;
    });
    var puntosRate = conCarga.map(function(r){
      // La tasa que reporta el RTE manda: la planilla divide por el tiempo de
      // eventos registrados, no por el reloj, y ese es el número que la
      // operación ya informa. Solo si el libro no la trae se recalcula.
      var horas = (r.hitos.finCarga - r.hitos.inicioCarga) / 3600000;
      var valor = r.tasaDia > 0 ? r.tasaDia : r.tonelaje / horas * 24;
      return {etiqueta:r.nave, corta:naveCorta(r.nave), valor: valor,
              propia: r.tasaDia > 0};
    });
    var objetivo = num("tasaDia");
    G.lineas($("g-rate"), puntosRate, {
      color: SERIE.efectiva, alto: 190,
      referencia: objetivo > 0 ? objetivo : undefined,
      fmtEje: function(v){ return v < 1000 ? "0" : Math.round(v/1000) + "k"; },
      fmtValor: function(v){ return Math.round(v).toLocaleString("es-CL"); },
      fmtTip: function(v){ return Math.round(v).toLocaleString("es-CL") + " t/día"; }
    });
    var recalculadas = puntosRate.filter(function(p){ return !p.propia; }).length;
    $("rate-nota").textContent = !puntosRate.length ? "faltan hitos de carguío"
      : (objetivo > 0 ? "línea gris: objetivo " + Math.round(objetivo).toLocaleString("es-CL") + " t/día · " : "") +
        puntosRate.length + " recaladas" +
        (recalculadas ? " · " + recalculadas + " recalculada(s), su libro no trae la tasa" : "");

    var puntosCtrl = calc.filter(function(r){ return (r.controlable + r.noControlable) > 0; })
      .map(function(r){
        var det = r.controlable + r.noControlable;
        return {etiqueta:r.nave, corta:naveCorta(r.nave), valor: r.controlable / det * 100};
      });
    G.lineas($("g-tendencia-ctrl"), puntosCtrl, {
      color: SERIE.controlable, alto: 190,
      fmtEje: function(v){ return Math.round(v) + " %"; },
      fmtValor: function(v){ return pct(v); },
      fmtTip: function(v){ return pct(v) + " de las detenciones"; }
    });
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
      $("tb-flota").innerHTML = "<tr><td colspan='12' class='text-3'>Todavía no hay recaladas en la temporada.</td></tr>";
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
        "<td class='text-2'>" + (r.hitos.nor ? fechaLarga(r.hitos.nor) : "—") + "</td>" +
        "<td class='n'>" + (r.hitos.nor && r.hitos.primeraEspia && r.hitos.primeraEspia > r.hitos.nor
            ? (Math.round(L.diasEntre(r.hitos.nor, r.hitos.primeraEspia)*10)/10).toLocaleString("es-CL",
                {minimumFractionDigits:1,maximumFractionDigits:1}) + " d"
            : "<span class='text-3'>—</span>") + "</td>" +
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
        var codigo = reg && reg.campos ? reg.campos.codigo : null;
        flota = FL.eliminar(flota, b.dataset.quitar);
        FL.guardar(flota);
        refrescarSelector();
        renderFlota();
        if(codigo) NUBE.eliminar(codigo).then(pintarEstadoNube);
      });
    });
  }

  /* ──────────────────────────── clima ──────────────────────────── */

  var CLAVE_UMBRALES = "demurrage-ppt.umbrales.v1";
  var serieClima = [];

  function umbrales(){
    var u = {};
    for(var k in CLIMA.UMBRALES) u[k] = CLIMA.UMBRALES[k];
    try{
      var g = JSON.parse(localStorage.getItem(CLAVE_UMBRALES) || "null");
      if(g) for(var j in g) if(typeof g[j] === "number") u[j] = g[j];
    }catch(e){}
    return u;
  }

  function leerUmbralesDelFormulario(){
    var u = {
      vientoAviso: num("u-viento-aviso"), vientoAlerta: num("u-viento-alerta"),
      rafagaAlerta: num("u-rafaga"), olaAviso: num("u-ola-aviso"),
      olaAlerta: num("u-ola-alerta"), visibilidadAviso: num("u-vis"),
      visibilidadAlerta: Math.round(num("u-vis") / 2)
    };
    try{ localStorage.setItem(CLAVE_UMBRALES, JSON.stringify(u)); }catch(e){}
    return u;
  }

  function pintarUmbrales(){
    var u = umbrales();
    $("u-viento-aviso").value = u.vientoAviso;
    $("u-viento-alerta").value = u.vientoAlerta;
    $("u-rafaga").value = u.rafagaAlerta;
    $("u-ola-aviso").value = u.olaAviso;
    $("u-ola-alerta").value = u.olaAlerta;
    $("u-vis").value = u.visibilidadAviso;
    $("c-viento-sub").textContent = "umbral de operación: " + u.vientoAviso + " kn";
  }

  function avisoClima(html, clase){
    $("clima-aviso").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  function horaCorta(d){
    return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  }
  function diaHora(d){
    var hoy = new Date();
    var mismoDia = d.toDateString() === hoy.toDateString();
    var manana = new Date(hoy.getTime() + 86400000).toDateString() === d.toDateString();
    var prefijo = mismoDia ? "hoy" : manana ? "mañana" :
      d.toLocaleDateString("es-CL", {weekday:"short", day:"2-digit", month:"short"});
    return prefijo + " " + horaCorta(d);
  }

  function consultarClima(){
    avisoClima("Consultando Open-Meteo…", "info");
    $("clima-consulta").textContent = "consultando…";
    CLIMA.consultar(CLIMA.PUERTO, 3).then(function(r){
      serieClima = r.serie;
      avisoClima(r.conMar ? "" :
        "El servicio marino no devolvió datos para este punto: las alertas van solo con viento y visibilidad.",
        "warn");
      $("clima-consulta").textContent = "Open-Meteo · " + r.consultadoEn.toLocaleString("es-CL",
        {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
      renderClima();
    }).catch(function(err){
      avisoClima("No se pudo consultar el pronóstico: " + esc(err.message) +
        " Si el terminal bloquea salidas a internet, esta vista no va a funcionar desde la red interna.", "error");
      $("clima-consulta").textContent = "sin conexión";
    });
  }

  function renderClima(){
    var u = umbrales();
    if(!serieClima.length) return;

    var ahora = new Date();
    var actual = serieClima.filter(function(p){ return p.hora <= ahora; }).pop() || serieClima[0];
    var e = CLIMA.evaluar(actual, u);
    var op = CLIMA.ventanaOperativa(serieClima, u, ahora);

    // Estado operacional
    var hero = $("clima-hero");
    hero.className = "hero " + (e.nivel === "alerta" ? "demurrage" : e.nivel === "aviso" ? "neutro" : "despatch");
    $("clima-hero-rot").textContent = e.nivel === "ok" ? "Condiciones operables" : "Embarque detenido por clima";
    $("clima-hero-val").textContent = e.nivel === "ok" ? "OPERABLE" : (e.nivel === "alerta" ? "SEVERO" : "DETENIDO");
    $("clima-hero-val").style.color = e.nivel === "ok" ? OK : (e.nivel === "alerta" ? CRITICO : "#D97C30");
    $("clima-hero-sub").textContent = e.nivel === "ok"
      ? (op.horas ? "Ventana operativa de " + op.horas + " h, hasta " + diaHora(op.hasta) + "." : "Sin restricciones en las próximas horas.")
      : e.motivos.join(" · ") + ".";

    // Cifras actuales
    $("c-viento").textContent = actual.viento != null ? (Math.round(actual.viento*10)/10).toLocaleString("es-CL") : "—";
    $("c-viento").style.color = actual.viento >= u.vientoAlerta ? CRITICO : actual.viento >= u.vientoAviso ? "#D97C30" : OK;
    $("kpi-viento").style.borderTopColor = actual.viento >= u.vientoAviso ? CRITICO : OK;
    $("c-viento-sub").textContent = "umbral " + u.vientoAviso + " kn · rumbo " + CLIMA.rumbo(actual.direccion);
    $("c-rafaga").textContent = actual.rafaga != null ? Math.round(actual.rafaga) : "—";
    $("c-rafaga-sub").textContent = "severo sobre " + u.rafagaAlerta + " kn";
    $("c-ola").textContent = actual.ola != null ? actual.ola.toFixed(1) : "—";
    $("c-ola-sub").textContent = actual.ola != null ? "severo sobre " + u.olaAlerta + " m" : "sin dato marino";
    $("c-vis").textContent = actual.visibilidad != null ? (actual.visibilidad/1000).toFixed(1) : "—";
    $("c-vis-sub").textContent = "atención bajo " + (u.visibilidadAviso/1000).toFixed(1) + " km";

    // Alertas
    var v = CLIMA.ventanas(serieClima, u).filter(function(w){ return w.hasta > ahora; });
    $("clima-alertas-nota").textContent = v.length
      ? v.length + (v.length === 1 ? " ventana" : " ventanas") + " en las próximas 72 h"
      : "sin condiciones adversas previstas";
    $("clima-alertas").innerHTML = v.length ? v.map(function(w){
      var clase = w.nivel === "alerta" ? "error" : "warn";
      var detalle = [];
      if(w.vientoMax != null) detalle.push("viento hasta " + Math.round(w.vientoMax) + " kn");
      if(w.rafagaMax != null) detalle.push("ráfagas " + Math.round(w.rafagaMax) + " kn");
      if(w.olaMax != null) detalle.push("marejada " + w.olaMax.toFixed(1) + " m");
      return '<div class="aviso ' + clase + '" style="margin-bottom:8px">' +
        "<strong>" + esc(diaHora(w.desde)) + " → " + esc(diaHora(w.hasta)) + "</strong> · " +
        w.horas + " h · " + esc(detalle.join(" · ")) +
        "<br><span class='text-2'>Causa: " + esc(w.causas.join(", ")) + "</span></div>";
    }).join("") : '<p class="text-2">Sin condiciones que detengan el embarque en las próximas 72 horas.</p>';

    // Curva de viento contra el umbral
    var proximas = serieClima.filter(function(p){ return p.hora >= ahora; }).slice(0, 48);
    G.lineas($("g-viento"), proximas.map(function(p){
      return {etiqueta: diaHora(p.hora), corta: horaCorta(p.hora), valor: p.viento || 0};
    }), {
      color: SERIE.nocontrolable, alto: 210, referencia: u.vientoAviso,
      fmtEje: function(x){ return Math.round(x); },
      fmtValor: function(x){ return Math.round(x) + " kn"; },
      fmtTip: function(x){ return Math.round(x*10)/10 + " kn"; }
    });
    $("clima-curva-nota").textContent = "línea gris: umbral de " + u.vientoAviso + " kn · próximas " + proximas.length + " h";

    // Tabla
    $("tb-clima").innerHTML = proximas.map(function(p){
      var ev = CLIMA.evaluar(p, u);
      var color = ev.nivel === "alerta" ? CRITICO : ev.nivel === "aviso" ? "#D97C30" : OK;
      var texto = ev.nivel === "alerta" ? "Severo" : ev.nivel === "aviso" ? "Detiene" : "Opera";
      return "<tr><td class='text-2'>" + esc(diaHora(p.hora)) + "</td>" +
        "<td class='n'>" + (p.viento != null ? Math.round(p.viento*10)/10 : "—") + "</td>" +
        "<td class='n'>" + (p.rafaga != null ? Math.round(p.rafaga) : "—") + "</td>" +
        "<td class='text-2'>" + CLIMA.rumbo(p.direccion) + "</td>" +
        "<td class='n'>" + (p.ola != null ? p.ola.toFixed(1) : "—") + "</td>" +
        "<td class='n'>" + (p.visibilidad != null ? (p.visibilidad/1000).toFixed(1) + " km" : "—") + "</td>" +
        "<td style='color:" + color + "'>" + texto + "</td></tr>";
    }).join("");
  }

  /* ───────────────────────── nube ──────────────────────────────── */

  var COLOR_NUBE = {off:"#6E7380", sincronizando:"#D97C30", ok:OK, error:CRITICO};
  var TEXTO_NUBE = {off:"Solo este equipo", sincronizando:"Sincronizando…", ok:"En línea", error:"Sin conexión"};

  function pintarEstadoNube(){
    var e = NUBE.estado();
    $("nube-punto").style.background = COLOR_NUBE[e] || COLOR_NUBE.off;
    $("nube-estado").textContent = TEXTO_NUBE[e] || TEXTO_NUBE.off;
    $("chip-nube").title = e === "error" ? "Sincronización: " + NUBE.error() : "Sincronización con la nube";
    var c = NUBE.config();
    $("nube-nota").textContent = NUBE.activa()
      ? c.tabla + " · " + c.url.replace(/^https?:\/\//, "")
      : "sin configurar";
  }

  function avisoNube(html, clase){
    $("nube-aviso").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  /**
   * Lee la nube, fusiona con lo local y sube solo lo que allá está más viejo.
   * El orden importa: subir primero pisaría el trabajo de otra persona.
   */
  function sincronizar(silencioso){
    if(!NUBE.activa()) return Promise.resolve(false);
    return NUBE.listar().then(function(remotos){
      var antes = flota.length;
      var fusion = NUBE.fusionar(flota, remotos);
      var subir = NUBE.pendientesDeSubir(fusion, remotos);

      flota = FL.ordenar(fusion);
      FL.guardar(flota);
      refrescarSelector();
      if(!$("vista-flota").hidden) renderFlota();

      return Promise.all(subir.map(function(r){ return NUBE.guardar(r, L); })).then(function(){
        if(!silencioso){
          var partes = [flota.length + " embarques en total"];
          if(flota.length > antes) partes.push((flota.length - antes) + " nuevos desde la nube");
          if(subir.length) partes.push(subir.length + " subidos");
          avisoNube("Sincronizado: " + partes.join(" · ") + ".", "ok");
        }
        pintarEstadoNube();
        return true;
      });
    }).catch(function(err){
      if(!silencioso) avisoNube("No se pudo sincronizar: " + esc(err.message), "error");
      return false;
    });
  }

  function cargarConfigNube(){
    var c = NUBE.config();
    $("nube-url").value = c.url;
    $("nube-key").value = c.anonKey;
    $("nube-tabla").value = c.tabla;
    pintarEstadoNube();
  }

  /* ─────────────── historial: guardado y selector ──────────────── */

  var MES = ["enero","febrero","marzo","abril","mayo","junio",
             "julio","agosto","septiembre","octubre","noviembre","diciembre"];

  /**
   * Guarda la recalada abierta sin pedir permiso. Solo si trae código de
   * embarque: es lo que la identifica, y sin él cada cálculo crearía una
   * entrada nueva en vez de actualizar la misma.
   */
  function autoguardar(){
    var codigo = $("codigo").value.trim();
    if(!codigo) return false;

    /* Si el contenido es idéntico al guardado, no se toca nada. Abrir un
       embarque para mirarlo no es editarlo, y cada subida innecesaria es otra
       petición en vuelo que puede llegar desordenada y resucitar una copia
       vieja. */
    var campos = camposActuales(), deducciones = leerDeducciones();
    var huella = JSON.stringify({campos: campos, deducciones: deducciones});
    var previo = null;
    flota.forEach(function(r){
      if((r.campos.codigo || "").trim().toUpperCase() === codigo.toUpperCase()) previo = r;
    });
    if(previo && JSON.stringify({campos: previo.campos, deducciones: previo.deducciones}) === huella){
      return false;
    }

    var registro = {campos: campos, deducciones: deducciones,
                    actualizadoEn: new Date().toISOString()};
    flota = FL.agregar(flota, registro);
    FL.guardar(flota);
    refrescarSelector();
    NUBE.guardar(registro, L).then(pintarEstadoNube);
    return true;
  }

  /** Fecha con la que se ordena y se rotula un embarque en el historial. */
  function fechaDe(reg){
    var c = reg.campos;
    return L.parseFechaHora(c.primeraEspia) || L.parseFechaHora(c.inicioCarga) ||
           L.parseFechaHora(c.nor) || null;
  }

  /** Reconstruye el desplegable: más reciente primero, agrupado por mes. */
  function refrescarSelector(){
    var sel = $("selector-recaladas");
    var elegido = sel.value;
    var orden = flota.slice().sort(function(a,b){
      var fa = fechaDe(a), fb = fechaDe(b);
      if(!fa && !fb) return 0;
      if(!fa) return 1;
      if(!fb) return -1;
      return fb - fa;                       // el embarque más reciente arriba
    });

    sel.innerHTML = "";
    sel.appendChild(new Option(flota.length
      ? "Historial · " + flota.length + (flota.length === 1 ? " embarque" : " embarques")
      : "Historial de embarques", ""));

    var grupoActual = null, grupo = null;
    orden.forEach(function(reg){
      var f = fechaDe(reg);
      var clave = f ? f.getFullYear() + "-" + f.getMonth() : "sin-fecha";
      if(clave !== grupoActual){
        grupoActual = clave;
        grupo = document.createElement("optgroup");
        grupo.label = f ? (MES[f.getMonth()] + " " + f.getFullYear()) : "Sin fecha";
        sel.appendChild(grupo);
      }
      var etiqueta = (f ? String(f.getDate()).padStart(2,"0") + " " + MES[f.getMonth()].slice(0,3) + " · " : "") +
        (reg.campos.nave || "(sin nombre)") +
        (reg.campos.codigo ? " · " + reg.campos.codigo : "");
      var op = new Option(etiqueta, reg.id);
      grupo.appendChild(op);
    });

    // Se mantiene marcado el embarque abierto.
    var abierto = null;
    var codigo = $("codigo").value.trim().toUpperCase();
    if(codigo){
      flota.forEach(function(r){
        if((r.campos.codigo || "").trim().toUpperCase() === codigo) abierto = r.id;
      });
    }
    sel.value = abierto || elegido || "";
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
    plegarRecaladaSegunEstado();
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
    $("vista-flota").hidden = cual !== "flota";
    $("vista-clima").hidden = cual !== "clima";
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){
      t.classList.toggle("on", t.dataset.vista === cual);
    });
    window.scrollTo(0, 0);
  }

  /**
   * Trae el bloque de la recalada a la vista.
   * Antes esto era saltar a otra pestaña; ahora todo vive en el dashboard,
   * así que basta con abrir el bloque y desplazarse hasta él.
   */
  /**
   * El bloque de la recalada se abre solo cuando no hay nada cargado.
   * Con datos, se pliega: si no, el veredicto y la cifra quedan empujados
   * media pantalla hacia abajo por una tabla que ya se leyó una vez.
   * No se llama desde calcular(): cerrarlo mientras alguien corrige un dato
   * sería pelearle al usuario.
   */
  function plegarRecaladaSegunEstado(){
    var b = $("bl-recalada");
    if(!b) return;
    var nave = $("nave").value, codigo = $("codigo").value;
    /* Se queda abierto solo si el cálculo no llegó a salir: ahí el bloque es
       el lugar donde se arregla. Un aviso no basta para dejarlo abierto —casi
       todo libro real trae alguno y entonces no se cerraría nunca—, pero
       tampoco puede quedar escondido: un aviso dentro de un bloque cerrado no
       existe. Por eso la cuenta va en el rótulo, que sí se ve plegado. */
    b.open = !(nave || codigo) || !ultimoTimeSheet;

    var nota = (nave || codigo) ? [nave, codigo].filter(Boolean).join(" · ") : "sin datos importados";
    var pendientes = $("aviso-import").querySelectorAll(".warn, .error").length +
                     $("aviso-nor").querySelectorAll(".warn, .error").length;
    var rot = $("recalada-origen");
    rot.textContent = nota + (pendientes ? "  ·  " + pendientes +
      (pendientes === 1 ? " aviso por revisar" : " avisos por revisar") : "");
    rot.style.color = pendientes ? AVISO : "";
  }

  function enfocarRecalada(){
    verVista("dashboard");
    var b = $("bl-recalada");
    if(!b) return;
    b.open = true;
    b.scrollIntoView({behavior:"smooth", block:"start"});
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
      if(t.dataset.vista === "clima"){
        if(serieClima.length) renderClima(); else consultarClima();
      }
    });
  });
  $("selector-recaladas").addEventListener("change", function(e){
    if(e.target.value) abrirRecalada(e.target.value);
  });
  $("btn-cargar").addEventListener("click", function(){ $("archivo").click(); });
  $("archivo").addEventListener("change", function(e){ leerArchivo(e.target.files[0]); });
  $("btn-imprimir").addEventListener("click", function(){ window.print(); });
  $("btn-presentar").addEventListener("click", function(){
    if(!$("nave").value && !$("codigo").value){
      avisos(["Carga un registro de tiempos antes de presentar."], "warn");
      enfocarRecalada();
      return;
    }
    calcular();
    PRES.abrir(contexto(ultimoTimeSheet), {G:G, L:L, LEC:LEC});
  });
  $("pres-cerrar").addEventListener("click", function(){ PRES.cerrar(); });
  $("pres-anterior").addEventListener("click", function(){ PRES.mostrar(-1 + indiceActual()); });
  $("pres-siguiente").addEventListener("click", function(){ PRES.mostrar(1 + indiceActual()); });
  $("pres-imprimir").addEventListener("click", function(){ window.print(); });
  function indiceActual(){
    var pastillas = document.querySelectorAll("#pres-pasos .paso");
    for(var i=0;i<pastillas.length;i++){ if(pastillas[i].classList.contains("on")) return i; }
    return 0;
  }
  $("btn-calcular").addEventListener("click", function(){ calcular(); });
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
    var listos = 0, fallidos = [], reparos = [], subidas = [], pendientes = archivos.length;

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
          var registro = {campos: camposDesdeImportacion(r.datos), deducciones: deduc,
                          actualizadoEn: new Date().toISOString()};
          flota = FL.agregar(flota, registro);
          subidas.push(registro);
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
      refrescarSelector();
      renderFlota();
      // Lo cargado en lote también viaja a la nube: si no, queda solo aquí.
      if(NUBE.activa()){
        Promise.all(subidas.map(function(r){ return NUBE.guardar(r, L); })).then(pintarEstadoNube);
      }
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
    refrescarSelector();
    renderFlota();
    avisoFlota("Temporada vaciada.", "info");
  });

  $("btn-clima-consultar").addEventListener("click", consultarClima);
  $("btn-clima-umbrales").addEventListener("click", function(){
    var c = $("clima-umbrales");
    c.hidden = !c.hidden;
    $("btn-clima-umbrales").textContent = c.hidden ? "Umbrales" : "Ocultar umbrales";
  });
  ["u-viento-aviso","u-viento-alerta","u-rafaga","u-ola-aviso","u-ola-alerta","u-vis"].forEach(function(id){
    $(id).addEventListener("change", function(){ leerUmbralesDelFormulario(); pintarUmbrales(); renderClima(); });
  });

  $("btn-nube-guardar").addEventListener("click", function(){
    NUBE.configurar({url:$("nube-url").value, anonKey:$("nube-key").value, tabla:$("nube-tabla").value});
    pintarEstadoNube();
    if(!NUBE.activa()){ avisoNube("Faltan la URL o la anon key.", "warn"); return; }
    avisoNube("Conectando…", "info");
    NUBE.probar()
      .then(function(){ return sincronizar(true); })
      .then(function(){
        avisoNube("Conectado. El historial ahora se comparte con quien abra este sitio.", "ok");
        pintarEstadoNube();
      })
      .catch(function(err){ avisoNube("No se pudo conectar: " + esc(err.message), "error"); pintarEstadoNube(); });
  });

  $("btn-nube-probar").addEventListener("click", function(){
    NUBE.configurar({url:$("nube-url").value, anonKey:$("nube-key").value, tabla:$("nube-tabla").value});
    avisoNube("Probando…", "info");
    NUBE.probar()
      .then(function(){ avisoNube("La tabla responde y las credenciales sirven.", "ok"); pintarEstadoNube(); })
      .catch(function(err){ avisoNube(esc(err.message), "error"); pintarEstadoNube(); });
  });

  $("btn-nube-sincronizar").addEventListener("click", function(){
    if(!NUBE.activa()){ avisoNube("Primero conecta un proyecto.", "warn"); return; }
    avisoNube("Sincronizando…", "info");
    sincronizar(false).then(pintarEstadoNube);
  });

  $("btn-nube-olvidar").addEventListener("click", function(){
    if(!confirm("Se desconecta la nube. El historial local se conserva. ¿Continuar?")) return;
    NUBE.olvidar();
    cargarConfigNube();
    avisoNube("Desconectado. El historial vuelve a ser solo de este equipo.", "info");
  });

  var soltarNor = $("soltar-nor");
  soltarNor.addEventListener("click", function(){ $("archivo-nor").click(); });
  soltarNor.addEventListener("dragover", function(e){ e.preventDefault(); soltarNor.classList.add("encima"); });
  soltarNor.addEventListener("dragleave", function(){ soltarNor.classList.remove("encima"); });
  soltarNor.addEventListener("drop", function(e){
    e.preventDefault(); soltarNor.classList.remove("encima");
    if(e.dataTransfer.files && e.dataTransfer.files.length) leerPdfNor(e.dataTransfer.files[0]);
  });
  $("archivo-nor").addEventListener("change", function(e){ leerPdfNor(e.target.files[0]); e.target.value = ""; });

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
      if(!$("vista-clima").hidden) renderClima();
    }, 180);
  });

  /* ────────────────────────── arranque ─────────────────────────── */

  // Iconos y escena de puerto: se inyectan una vez, antes de pintar nada.
  document.getElementById("sprite-iconos").innerHTML = window.Escena.sprite();
  document.getElementById("escena-puerto").innerHTML = window.Escena.ESCENA;
  if(typeof pdfjsLib !== "undefined"){
    pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
  }

  PRES.iniciar();
  pintarUmbrales();
  $("enlace-windy").href = "https://www.windy.com/?" + CLIMA.PUERTO.lat + "," + CLIMA.PUERTO.lon + ",10";
  NUBE.alCambiar(pintarEstadoNube);
  flota = FL.cargar();
  refrescarSelector();
  cargarConfigNube();
  if(NUBE.activa()){
    sincronizar(true);
    // Relevo periódico: otra persona puede estar cargando embarques ahora.
    setInterval(function(){ sincronizar(true); }, 60000);
  }
  var habia = restaurar();
  alternarPermitido();
  if(habia){
    calcular();
    plegarRecaladaSegunEstado();
  }else{
    renderCabecera();
    renderResumenRecalada();
    renderProductividad();
    renderComposicion(leerDeducciones());
    renderCausas(leerDeducciones());
    renderMuellaje();
    renderIndices(leerDeducciones());
    renderVacioTimeSheet();
    enfocarRecalada();
  }
})();
