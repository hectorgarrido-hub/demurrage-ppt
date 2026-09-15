/**
 * Dashboard de laytime & demurrage — PPT.
 * Une el motor de cálculo, el lector del RTE y las primitivas de gráfico.
 */
(function(){
  "use strict";

  var L = window.Laytime, IMP = window.ImportarRTE, G = window.Graficos, FL = window.Flota, NOR = window.LeerNOR, LEC = window.Lectura, PRES = window.Presentacion, NUBE = window.Nube, CLIMA = window.Clima, REP = window.Reporteria, TRI = window.Trimestres;
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
  var serieClima = [];     // serie horaria del pronóstico, una vez consultado

  // Las horas vienen del libro: se editan solo si el registro trae un error.
  var horasBloqueadas = true;

  var CAMPOS = ["nave","codigo","tonelaje","eslora","tarifaMuelle",
                "eta","arribo","nor","norAceptado","freePratique","primeraEspia","inicioCarga",
                "finCarga","ultimaEspia","baseInicio","turnTime","baseTermino","modoPermitido","tasaDia",
                "horasFijas","modoConteo","tarifaDemurrage","modoDespatch","porcentajeDespatch",
                "tarifaDespatch","festivos",
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
  /* Millones para las escalas: "US$ 4,24 M" cabe donde "US$ 4.243.851" se
     corta, y a tres metros de una pantalla de sala es lo que se alcanza a
     leer. Los montos exactos siguen en las fichas y en la tabla. */
  function usdCompacto(v){
    var n = Math.abs(v);
    if(n >= 1e6) return "US$ " + (v/1e6).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}) + " M";
    if(n >= 1e4) return "US$ " + Math.round(v/1000).toLocaleString("es-CL") + " k";
    return usd(v);
  }
  function hrs(v){ return L.horasAHm(v); }
  function hDec(v){ return (Math.round(v*100)/100).toLocaleString("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}) + " h"; }
  /* Días decimales con cuatro cifras, que es como los expresa el Laytime
     Statement del área comercial: «14,3479 days at the rate of US$ 41.906,00
     per day». Con ese número a la vista la liquidación se puede rehacer en
     una calculadora sin traducir horas y minutos a fracción de día. */
  function diasDec(v){ return (v/24).toLocaleString("es-CL",{minimumFractionDigits:4,maximumFractionDigits:4}) + " d"; }
  function pct(v){ return (Math.round(v*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " %"; }
  function fechaLarga(d){
    if(!d) return "—";
    return d.toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"}) + " " +
           String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  }
  /* Sin el año: en la ficha compite con la hora por el ancho y el año ya
     está en la cabecera de la recalada. No se llama `fechaCorta` porque ese
     nombre ya está tomado más abajo por otra que recibe el id del campo, no
     la fecha; declararla dos veces deja ganar a la última y el error aparece
     recién al pintar. */
  function fechaFicha(d){
    if(!d) return "—";
    return d.toLocaleDateString("es-CL",{day:"2-digit",month:"short"}).replace(".","").replace("-"," ") + " " +
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
      primeraEspia: fh("primeraEspia"), turnTime: num("turnTime"),
      inicioOperaciones: fh("inicioCarga")
    });
    var termino = $("baseTermino").value === "ultimaEspia" ? fh("ultimaEspia") : fh("finCarga");

    var errores = [];
    if(!inicio){
      errores.push(baseInicio === "nor" || baseInicio === "loPrimero"
        ? "Falta la fecha/hora del NOR presentado."
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
        ? "Falta el tonelaje embarcado: sin él no hay laytime que calcular."
        : "El laytime resulta 0: revisa el tonelaje y la tasa de embarque.");
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
      renderUtilizacion(null);
      ultimoTimeSheet = null;
      renderVeredicto(contexto(null));
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
      modoDespatch: $("modoDespatch").value,
      porcentajeDespatch: num("porcentajeDespatch"),
      tarifaDespatch: num("tarifaDespatch")
    });

    renderResultado(r);
    renderKpis(r);
    renderUtilizacion(r, inicio, termino);
    ultimoTimeSheet = r;
    var ctx = contexto(r);
    renderVeredicto(ctx);
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

  /* Cuántos caracteres entran en la ficha depende del ancho de la pantalla:
     a 1.500 px son catorce, a 1.920 son diecisiete. Contar letras obliga a
     elegir un número que va a estar mal en una de las dos, así que se mide:
     si la cifra no cabe en su fila, se achica. Es lo único que funciona
     igual en el notebook del terminal y en el monitor de la sala. */
  function ajustarCifra(el){
    el.className = "";
    var hueco = el.parentNode.clientWidth;
    if(!hueco) return;   // pestaña oculta: no hay ancho que medir todavía
    if(el.getBoundingClientRect().width > hueco) el.className = "cifra-larga";
  }

  /** Pinta una de las dos fichas de resultado: con cifra, o apagada con «n/a». */
  function fichaResultado(id, clase, valor, detalle){
    $("kpi-" + id).className = "kpi " + clase;
    var cifra = $("k-" + id);
    cifra.textContent = valor;
    ajustarCifra(cifra);
    $("k-" + id + "-sub").textContent = detalle;
  }

  /* Demurrage y despatch nunca ocurren juntos, así que cada uno tiene su
     ficha y la que no corresponde dice «n/a» en vez de un cero: un cero se
     lee como «no se cobró nada» y lo que pasa es que esa liquidación no
     aplica. Las dos son del mismo porte que el resto de la tira. */
  function renderResultado(r){
    if(r.esDemurrage){
      fichaResultado("demurrage", "demurrage", usdExacto(r.montoDemurrage),
        diasDec(r.horasDemurrage) + " \u00d7 " + usd(num("tarifaDemurrage")) + "/día");
      fichaResultado("despatch", "na", "n/a", "la nave se pasó del laytime");
    }else if($("aplicaDespatch").checked && r.horasDespatch > 0){
      fichaResultado("demurrage", "na", "n/a", "terminó dentro del laytime");
      // El detalle dice con qué rate se pagó, sea propio o derivado del demurrage.
      fichaResultado("despatch", "despatch", usdExacto(r.montoDespatch),
        diasDec(r.horasDespatch) + " \u00d7 " + usd(r.tarifaDespatchAplicada) + "/día");
    }else{
      fichaResultado("demurrage", "na", "n/a", "terminó dentro del laytime");
      fichaResultado("despatch", "na", "n/a", "no está pactado en el charter party");
    }
  }

  function renderKpis(r){
    $("k-allowed").textContent = hrs(r.permitido);
    $("k-allowed-sub").textContent = L.horasADias(r.permitido) +
      ($("modoPermitido").value === "tasa" ? " · " + num("tasaDia").toLocaleString("es-CL") + " t/día" : " · horas fijas");

    $("k-usado").textContent = hrs(r.horasUsadas);
    $("k-usado-sub").textContent = "utilización " + pct(r.utilizacion);
    $("kpi-usado").style.borderTopColor = r.balance < 0 ? CRITICO : "var(--op-border-subtle)";

    renderEta();
    renderEspera();

    $("k-balance").textContent = (r.balance < 0 ? "" : "+") + hrs(r.balance);
    $("k-balance").style.color = r.balance < 0 ? CRITICO : OK;
    $("k-balance-sub").textContent = r.balance < 0 ? "sobre el laytime" : "dentro del laytime";
    $("kpi-balance").style.borderTopColor = r.balance < 0 ? CRITICO : OK;
    $("kpi-balance").querySelector(".ico-marca").style.color = r.balance < 0 ? CRITICO : OK;
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
      : (origen ? "según " + origen : "alimenta el laytime");

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
      ? "op. efectiva + cambio de turno"
      : "solo la entrega el RTE";

    $("p-tasa-hora").textContent = tasaH ? mil(tasaH) : "—";
    $("p-tasa-hora-sub").textContent = !tasaH ? "&nbsp;"
      : (calculadas ? "calculada · " : "") + hDec(eventos) + " de embarque";

    $("p-tasa-dia").textContent = tasaD ? mil(tasaD) : "—";

    // Contra la tasa pactada en el charter party, que es la que define el allowed.
    var pactada = $("modoPermitido").value === "tasa" ? num("tasaDia") : 0;
    if(tasaD && pactada){
      var d = (tasaD - pactada) / pactada * 100;
      $("p-tasa-dia-sub").textContent = (d >= 0 ? "+" : "") + pct(d) +
        " sobre lo pactado (" + mil(pactada) + ")";
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

  /* ETA nominado contra arribo real. El ETA solo no dice nada —es una fecha
     que se fijó semanas antes—; lo que se mira es si la nave llegó cuando
     dijo. Un adelanto también importa: llegar antes del laycan no obliga al
     terminal a recibirla, pero sí arranca la conversación del NOR. */
  function renderEta(){
    var eta = fh("eta"), arribo = fh("arribo") || fh("nor");
    if(!eta){
      $("k-eta").textContent = "—";
      $("k-eta-sub").textContent = "sin ETA nominado";
      $("kpi-eta").style.borderTopColor = "var(--op-border-subtle)";
      return;
    }
    $("k-eta").textContent = fechaFicha(eta);
    ajustarCifra($("k-eta"));
    if(!arribo){
      $("k-eta-sub").textContent = "sin arribo registrado";
      $("kpi-eta").style.borderTopColor = "var(--op-border-subtle)";
      return;
    }
    var dias = L.diasEntre(eta, arribo) || -L.diasEntre(arribo, eta);
    var desfase = Math.abs(dias);
    /* Bajo un día manda el reloj; sobre un día, los días: "arribó 54h 10m
       después" obliga a dividir por 24 para saber si es mucho. */
    var cuanto = desfase < 1
      ? hrs(desfase*24)
      : (Math.round(desfase*10)/10).toLocaleString("es-CL",{minimumFractionDigits:1,maximumFractionDigits:1}) + " d";
    $("k-eta-sub").textContent = desfase < 1/24
      ? "arribó en su ETA"
      : "arribó " + cuanto + (dias > 0 ? " después" : " antes");
    $("kpi-eta").style.borderTopColor = desfase >= 2 ? "#D97C30" : OK;
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
      tam: 158, grosor: 24,
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
      banda: 24,
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

  /**
   * El time sheet, ahora como comparación en vez de como resta.
   *
   * Eran dos cascadas: una en horas y otra «la misma, en dinero» que era la
   * de horas multiplicada por el rate —misma forma, otra escala— y ninguna
   * de las dos mostraba el permitido salvo como una línea suelta al pie.
   * Dos barras sobre la misma escala dicen lo mismo y además dejan ver de un
   * vistazo lo único que importa: cuánto sobresale el tiempo contado por
   * sobre el permitido. El dinero se fue al tooltip y a la nota, que es
   * donde una conversión lineal aporta sin ocupar un panel.
   */
  function renderBalance(r, inicio, termino){
    var tarifa = num("tarifaDemurrage");
    G.balanceLaytime($("g-balance"), {
      transcurridas: r.horasTranscurridas,
      excluidas:     r.horasExcluidas,
      deducidas:     r.horasDeducidas,
      usadas:        r.horasUsadas,
      permitido:     r.permitido
    }, {
      grosor: 26,
      colores: {
        dentro:      SERIE.efectiva,
        sobre:       CRITICO,
        regimen:     SERIE.neutro,
        deducciones: SERIE.nocontrolable,
        permitido:   SERIE.efectiva,
        sinUsar:     TEXTO2
      },
      fmt: function(v){ return hDec(v); },
      porHora: tarifa / 24,
      fmtDinero: function(v){ return usd(v); }
    });

    $("balance-nota").textContent = (inicio && termino)
      ? fechaLarga(inicio) + "  →  " + fechaLarga(termino) + "  ·  " + $("modoConteo").value
      : "\u00a0";

    /* Solo las categorías que de verdad hay en el gráfico: con SHINC el
       régimen de conteo no descuenta nada y su cuadradito quedaba ahí
       prometiendo un tramo que no existe. */
    var leyenda = [
      [SERIE.efectiva,      "Laytime usado",           r.horasUsadas],
      [CRITICO,             "Sobre el permitido",      r.balance < 0 ? -r.balance : 0],
      [SERIE.neutro,        "No cuenta · régimen",     r.horasExcluidas],
      [SERIE.nocontrolable, "No cuenta · deducciones", r.horasDeducidas]
    ].filter(function(l){ return l[2] > 0; });
    $("ley-balance").innerHTML = leyenda.map(function(l){
      return '<div class="ley-item"><span class="ley-sw" style="background:' + l[0] + '"></span>' + l[1] + "</div>";
    }).join("") + (tarifa > 0
      ? '<div class="ley-item text-3">cada hora vale ' + usd(tarifa/24) + " al rate de " + usd(tarifa) + "/día</div>"
      : '<div class="ley-item text-3">falta el demurrage rate</div>');
  }

  /**
   * Anillo de utilización del laytime: usado sobre permitido.
   *
   * Es el número que decide la recalada —bajo 100 % hay despatch, sobre 100 %
   * hay demurrage— y hasta ahora vivía como subtítulo de la ficha de laytime
   * usado. Sobre 100 % el anillo se completa y el exceso se pinta encima, para
   * que el desborde se vea como desborde y no como una fracción cualquiera.
   */
  function renderUtilizacion(r, inicio, termino){
    var nodo = $("g-utilizacion");
    if(!r || !r.permitido){
      G.donut(nodo, [], {tam:146});
      $("utilizacion-nota").innerHTML = "&nbsp;";
      G.balanceLaytime($("g-balance"), null, {});
      $("ley-balance").innerHTML = "";
      $("balance-nota").innerHTML = "&nbsp;";
      return;
    }
    renderBalance(r, inicio, termino);
    var u = r.utilizacion;
    var excedido = u > 100;
    var segmentos = excedido
      ? [{nombre:"Dentro del laytime", valor:100, color:SERIE.efectiva},
         {nombre:"Sobre el laytime",   valor:u - 100, color:CRITICO}]
      : [{nombre:"Laytime usado",  valor:u,       color:SERIE.efectiva},
         {nombre:"Sin usar",       valor:100 - u, color:SERIE.neutro}];

    G.donut(nodo, segmentos, {
      tam:146, grosor:20,
      centro: pct(u),
      centroColor: excedido ? CRITICO : OK,
      centroSub: excedido ? "sobre el laytime" : "del laytime"
    });
    $("utilizacion-nota").textContent = excedido
      ? L.horasAHm(r.horasDemurrage) + " por sobre las " + L.horasAHm(r.permitido) + " permitidas"
      : L.horasAHm(r.horasDespatch || r.balance) + " sin usar de las " + L.horasAHm(r.permitido) + " permitidas";
  }

  function renderVacioTimeSheet(faltantes){
    ["k-allowed","k-usado","k-balance","k-espera"].forEach(function(id){ $(id).textContent = "—"; });
    ["k-allowed-sub","k-usado-sub","k-balance-sub","k-espera-sub"].forEach(function(id){ $(id).innerHTML = "&nbsp;"; });
    renderEta();   // el ETA no depende del time sheet: se pinta igual
    // Lo que falta se nombra en la ficha de demurrage, que es la que el
    // usuario mira primero; un guion solo lo deja sin pista de qué cargar.
    fichaResultado("demurrage", "na", "—", (faltantes && faltantes.length)
      ? faltantes[0] + (faltantes.length > 1 ? " (y " + (faltantes.length - 1) + " dato más)" : "")
      : "Carga el registro de tiempos en el bloque «Recalada».");
    fichaResultado("despatch", "na", "—", "\u00a0");
  }

  function renderMuellaje(){
    var m = L.calcularMuellaje({
      primeraEspia: fh("primeraEspia"), ultimaEspia: fh("ultimaEspia"),
      horasMantenimiento: num("horasMantenimientoMuellaje"), horasGira: num("horasGira"),
      eslora: num("eslora"), tarifa: num("tarifaMuelle")
    });
    var tiempo = m.horasMuellaje ? hDec(m.horasMuellaje) : "—";
    var monto  = m.horasMuellaje ? usdExacto(m.monto) : "—";
    // Las fichas y el desglose muestran lo mismo: unas resumen, el otro explica.
    $("m-tiempo").textContent = tiempo;   $("m-tiempo-d").textContent = tiempo;
    $("m-nwh").textContent    = hDec(m.nwh); $("m-nwh-d").textContent = hDec(m.nwh);
    $("m-monto").textContent  = monto;    $("m-monto-d").textContent = monto;
    $("m-descuentos").textContent = hDec(m.descuentos);
    $("m-base").textContent = num("eslora").toLocaleString("es-CL") + " m × " + num("tarifaMuelle") + " US$/m/h";

    /* Cada ficha dice de dónde sale su cifra: si no, "NWH 129,80 h" obliga a
       abrir el desglose para saber qué se descontó. */
    $("m-tiempo-sub").textContent = m.horasMuellaje ? L.horasADias(m.horasMuellaje) : "faltan las espías";
    $("m-nwh-sub").textContent = m.horasMuellaje
      ? "(−) " + hDec(m.descuentos) + " de mtto. y gira" : "\u00a0";
    $("m-monto-sub").textContent = m.horasMuellaje
      ? num("eslora").toLocaleString("es-CL") + " m × " + num("tarifaMuelle") + " US$/m/h"
      : "\u00a0";
    ajustarCifra($("m-monto"));
  }

  function renderIndices(deduc){
    var mantenimiento = suma(deduc, function(d){ return d.mantenimiento; });
    var reserva = suma(deduc, function(d){ return d.lado === "nave"; });
    var i = L.indices({
      horasTotales: num("horasTotales"), horasMantenimiento: mantenimiento,
      horasReserva: reserva, horasOperacionEfectiva: num("horasOpEfectiva")
    });
    var hay = num("horasTotales") > 0;

    /* El subtítulo es la fracción a secas: el rótulo de la ficha ya dice cuál
       de los tres índices es, y "disponibles 131,55 h de 133,30 h" se partía
       en dos líneas que dejaban esta ficha 40 px más alta que las del
       muellaje, al lado. */
    medidor("df", hay ? i.df : null, hay ? hDec(i.disponibles) + " de " + hDec(num("horasTotales")) : "");
    medidor("u",  hay ? i.u  : null, hay ? hDec(i.operativas) + " de " + hDec(i.disponibles) : "");
    medidor("fo", hay ? i.fo : null, hay ? hDec(num("horasOpEfectiva")) + " de " + hDec(i.operativas) : "");
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

    /* Con NOR a la vista, el inicio por defecto deja de ser el amarre: el
       charter party de CMP cuenta desde que expira el turn time o desde que
       parte la operación, lo primero que ocurra. */
    if($("baseInicio").value === "amarre" && r.norPresentado) $("baseInicio").value = "loPrimero";
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

  /* La pestaña Flota ya no existe; sus avisos salen donde ocurre la acción,
     que es el bloque de recalada del dashboard. */
  function avisoFlota(html, clase){ avisoImport(html, clase); }

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

  /* renderFlota se retiró junto con su pestaña: la temporada ahora se
     dibuja desde el libro de reportería, que trae las 33 recaladas en vez
     de las que se hayan cargado sueltas. El almacén de flota sigue vivo:
     alimenta el historial del dashboard y las láminas de presentación. */
  function renderFlota(){ /* sin vista que dibujar */ }


  /* Las funciones de dibujo de la vista Flota se retiraron con ella:
     renderGantt, renderTendencias, renderDivergentes y renderTablaFlota
     escribían en nodos que ya no existen. Lo que mostraban vive ahora en
     la vista de temporada, alimentado por el libro de reportería. */

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
      // Modelo, no estación: decirlo en pantalla evita que alguien cite estas
      // cifras en un time sheet como si fueran la medición del terminal.
      $("clima-consulta").textContent = "modelo Open-Meteo · " + r.consultadoEn.toLocaleString("es-CL",
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
    $("clima-hero-rot").textContent = e.nivel === "ok" ? "Puerto abierto" : "Embarque detenido por clima";
    $("clima-hero-val").textContent = e.nivel === "ok" ? "ABIERTO" : (e.nivel === "alerta" ? "SEVERO" : "DETENIDO");
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

    /* Sin datos marinos, la ficha de marejada muestra "—", que a la distancia
       se lee como "mar calmo". Un dato ausente y una condición favorable no
       son lo mismo, menos cuando el criterio de detención depende de ellos. */
    var sinMarina = serieClima.every(function(p){ return p.ola == null; });
    $("kpi-marejada").style.opacity = sinMarina ? ".55" : "";
    if(sinMarina){
      avisoClima("El modelo marino no devolvió altura de ola para este punto: la marejada " +
        "queda sin evaluar y el estado del muelle sale solo de viento, ráfagas y visibilidad. " +
        "No lo leas como mar calmo.", "warn");
    }

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
    alternarDespatch();
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

  /* ═══════════════════════ TEMPORADA POR TRIMESTRES ══════════════════
     El libro de reportería trae el demurrage ya liquidado con el armador.
     Acá no se recalcula nada: se agrega por trimestre y se muestra lo que
     los números dicen juntos, que es lo que el libro no hace explícito. */

  var temporada = null;      // {datos, trimestres, diagnostico}

  function avisoRep(html, clase){
    $("rep-aviso").innerHTML = html ? '<div class="aviso '+(clase||"info")+'">'+html+'</div>' : "";
  }

  function leerLibroReporteria(archivo){
    if(!archivo) return;
    if(typeof XLSX === "undefined"){
      avisoRep("No se cargó el lector de Excel (js/vendor/xlsx.full.min.js).", "error");
      return;
    }
    var lector = new FileReader();
    lector.onload = function(ev){
      try{
        var libro = XLSX.read(new Uint8Array(ev.target.result), {type:"array", cellDates:true});
        aplicarReporteria(REP.desdeLibro(libro), archivo.name);
      }catch(err){
        avisoRep("No se pudo leer el libro: " + esc(err.message), "error");
      }
    };
    lector.onerror = function(){ avisoRep("No se pudo abrir el archivo.", "error"); };
    lector.readAsArrayBuffer(archivo);
  }

  function aplicarReporteria(r, nombre){
    var trimestres = TRI.porTrimestre(r.datos);
    temporada = {datos: r.datos, trimestres: trimestres, diagnostico: TRI.diagnostico(trimestres)};
    guardarTemporada();

    var html = "<strong>" + esc(nombre || "Libro") + "</strong>: " +
      r.datos.recaladas.length + " recaladas en " + trimestres.length +
      (trimestres.length === 1 ? " trimestre." : " trimestres.");
    if(r.avisos.length) html += "<ul><li>" + r.avisos.map(esc).join("</li><li>") + "</li></ul>";
    avisoRep(html, r.avisos.length ? "warn" : "ok");

    verVista("temporada");
    pintarFiltros();
    aplicarFiltro();
    var b = $("bl-reporteria");
    // Con la temporada cargada el bloque de carga estorba: lo que se mira son
    // los trimestres. Se queda abierto solo si hay algo que revisar.
    if(b) b.open = !!r.avisos.length;
    $("rep-origen").textContent = r.datos.recaladas.length + " recaladas · " +
      trimestres.map(function(q){ return q.trimestre; }).join(" · ");
  }

  var CLAVE_TEMP = "demurrage-ppt.temporada.v1";

  function guardarTemporada(){
    if(!temporada) return;
    try{
      // Solo los datos crudos: los trimestres se recalculan al abrir, para que
      // un cambio en la agregación alcance a lo ya guardado sin migraciones.
      localStorage.setItem(CLAVE_TEMP, JSON.stringify(temporada.datos));
    }catch(e){ /* almacenamiento bloqueado */ }
  }

  function restaurarTemporada(){
    var crudo = null;
    try{ crudo = JSON.parse(localStorage.getItem(CLAVE_TEMP) || "null"); }catch(e){ crudo = null; }
    if(!crudo || !crudo.recaladas || !crudo.recaladas.length) return false;
    // JSON no tiene fechas: vuelven como texto ISO y hay que rearmarlas, o la
    // espera NOR→amarre saldría vacía en todo lo que se recupera del navegador.
    ["recaladas","tiempos","plan"].forEach(function(k){
      (crudo[k] || []).forEach(function(x){
        ["laycanDesde","laycanHasta","eta","nor","atb","inicioCarga","finCarga","etb","etd"].forEach(function(c){
          if(typeof x[c] === "string") x[c] = new Date(x[c]);
        });
      });
    });
    (crudo.detenciones || []).forEach(function(d){
      ["inicio","fin"].forEach(function(c){ if(typeof d[c] === "string") d[c] = new Date(d[c]); });
    });
    var trimestres = TRI.porTrimestre(crudo);
    temporada = {datos: crudo, trimestres: trimestres, diagnostico: TRI.diagnostico(trimestres)};
    $("rep-origen").textContent = crudo.recaladas.length + " recaladas · " +
      trimestres.map(function(q){ return q.trimestre; }).join(" · ");
    var b = $("bl-reporteria");
    if(b) b.open = false;
    pintarFiltros();
    aplicarFiltro();
    return true;
  }

  /* ───────────────────────── render ──────────────────────────── */

  var filtroTemporada = {trimestre: "", mes: ""};

  /** Rellena los desplegables con lo que de verdad hay en los datos. */
  function pintarFiltros(){
    if(!temporada) return;
    var d = temporada.datos;
    var qs = {};
    (d.recaladas || []).forEach(function(r){ qs[r.trimestre] = true; });
    var trimestres = Object.keys(qs).sort();
    $("filtro-trimestre").innerHTML = '<option value="">Toda la temporada</option>' +
      trimestres.map(function(q){
        return '<option value="' + q + '"' + (filtroTemporada.trimestre === q ? " selected" : "") + ">" + q + "</option>";
      }).join("");
    $("filtro-mes").innerHTML = '<option value="">Todos</option>' +
      TRI.mesesDisponibles(d).map(function(m){
        return '<option value="' + m.mes + '"' + (String(filtroTemporada.mes) === String(m.mes) ? " selected" : "") +
          ">" + m.nombre + "</option>";
      }).join("");
  }

  /** Los datos que el tablero está mostrando ahora mismo. */
  function datosFiltrados(){
    return TRI.filtrar(temporada.datos, filtroTemporada);
  }

  function aplicarFiltro(){
    if(!temporada) return;
    var sub = datosFiltrados();
    var qs = TRI.porTrimestre(sub);
    temporada.vista = {datos: sub, trimestres: qs, diagnostico: TRI.diagnostico(qs)};
    var partes = [];
    if(filtroTemporada.trimestre) partes.push(filtroTemporada.trimestre);
    if(filtroTemporada.mes !== "") partes.push(TRI.MESES[Number(filtroTemporada.mes)]);
    $("filtro-nota").textContent = partes.length
      ? "mostrando " + partes.join(" · ") + " — " + sub.recaladas.length +
        (sub.recaladas.length === 1 ? " recalada" : " recaladas")
      : temporada.datos.recaladas.length + " recaladas · " +
        temporada.trimestres.map(function(q){ return q.trimestre; }).join(" · ");
    renderTemporada();
  }

  function renderTemporada(){
    if(!temporada) return;
    var v = temporada.vista || temporada;
    var qs = v.trimestres, d = v.diagnostico, t = d.total;
    if(!qs.length){
      $("temp-lectura").innerHTML = '<p class="text-3">El filtro no deja ninguna recalada.</p>';
      $("temp-hero-val").textContent = "—";
      return;
    }

    // ── veredicto en prosa ──
    var critico = t.usdPorTonelada >= 1;
    var rot = $("temp-sem-txt");
    rot.textContent = critico ? "costo alto" : t.usdPorTonelada >= 0.5 ? "con costo" : "limpia";
    rot.style.color = critico ? CRITICO : t.usdPorTonelada >= 0.5 ? AVISO : OK;
    $("temp-lectura").innerHTML = d.frases.map(function(f){
      return '<p style="margin:0 0 8px">' + esc(f) + '</p>';
    }).join("");

    // ── cifra y fichas ──
    $("temp-hero").className = "hero " + (t.neto > 0 ? "demurrage" : "despatch");
    $("temp-hero-val").textContent = usdExacto(t.neto);
    $("temp-hero-sub").textContent = usd(t.demurrage) + " de demurrage menos " +
      usd(t.despatch) + " de despatch · " + qs.length +
      (qs.length === 1 ? " trimestre" : " trimestres");

    $("t-recaladas").textContent = t.naves;
    $("t-recaladas-sub").textContent = t.enDemurrage + " con demurrage · " +
      (t.naves - t.enDemurrage) + " sin";
    $("t-tonelada").textContent = t.usdPorTonelada.toFixed(2);
    $("t-tonelada-sub").textContent = Math.round(t.cargo).toLocaleString("es-CL") + " t embarcadas";
    $("t-espera").textContent = Math.round(t.espera).toLocaleString("es-CL");
    $("t-espera-sub").textContent = t.operacion > 0
      ? (t.espera / t.operacion).toFixed(1) + " veces el tiempo de carga" : " ";
    $("t-allowed").textContent = pct(t.usoDelAllowed);
    $("t-allowed-sub").textContent = t.dentroDelAllowed + " de " + t.conTiempos + " naves dentro del laytime";
    $("t-allowed").style.color = t.usoDelAllowed <= 100 ? OK : CRITICO;

    /* Lo cobrado y lo estimado, separados: es la diferencia entre lo que ya
       está en la cuenta y lo que todavía puede cambiar. */
    $("t-liquidado").textContent = usdCompacto(t.netoLiquidado);
    $("t-liquidado-sub").textContent = t.proyectadas
      ? t.proyectadas + " de " + t.naves + " son proyección · " + usdCompacto(t.demurrageProyectado)
      : "las " + t.naves + " recaladas están liquidadas";
    $("kpi-t-liquidado").style.borderTopColor = t.proyectadas ? AVISO : "var(--cmp-blue-500)";
    $("temp-hero-sub").textContent = t.proyectadas
      ? usdCompacto(t.netoLiquidado) + " liquidados + " + usdCompacto(t.demurrageProyectado) +
        " proyectados · " + qs.length + (qs.length === 1 ? " trimestre" : " trimestres")
      : usd(t.demurrage) + " de demurrage menos " + usd(t.despatch) + " de despatch · " +
        qs.length + (qs.length === 1 ? " trimestre" : " trimestres");

    // ── demurrage neto por trimestre ──
    G.barras($("g-temp-neto"), qs.map(function(q){
      return {nombre: q.trimestre + " · " + q.naves + " naves", valor: q.neto};
    }), {color: CRITICO,
         fmtValor: function(v){ return usdCompacto(v); },
         fmtEje:   function(v){ return usdCompacto(v); }});
    $("temp-neto-nota").textContent = "total " + usd(t.neto);

    // ── dónde se va el tiempo ──
    var SERIES = [
      {nombre: "Espera antes del amarre", color: CRITICO},
      {nombre: "Operación de carga",      color: SERIE.efectiva},
      {nombre: "Laytime permitido",       color: SERIE.nocontrolable}
    ];
    G.barrasAgrupadas($("g-temp-tiempo"), qs.map(function(q){
      return {nombre: q.trimestre, valores: [q.espera, q.operacion, q.allowed]};
    }), SERIES, {fmt: function(v){ return Math.round(v) + " d"; }});
    $("ley-temp-tiempo").innerHTML = SERIES.map(function(se){
      return '<div class="ley-item"><span class="ley-sw" style="background:'+se.color+'"></span>'+se.nombre+'</div>';
    }).join("");

    // ── detenciones por categoría ──
    var porCat = {};
    qs.forEach(function(q){
      q.detenciones.forEach(function(c){
        if(!porCat[c.categoria]) porCat[c.categoria] = {categoria:c.categoria, dias:0, costo:0};
        porCat[c.categoria].dias += c.dias;
        porCat[c.categoria].costo += c.costo;
      });
    });
    var cats = Object.keys(porCat).map(function(k){ return porCat[k]; })
      .sort(function(a,b){ return b.dias - a.dias; });
    G.barras($("g-temp-detenciones"), cats.map(function(c){
      return {nombre: c.categoria, valor: c.dias};
    }), {color: SERIE.controlable,
         fmtValor: function(v){ return v.toFixed(1) + " d"; },
         fmtEje:   function(v){ return v.toFixed(0) + " d"; }});
    $("temp-det-nota").textContent = t.diasDetenidos.toFixed(1) + " días en total";

    $("tb-temp-det").innerHTML = qs.reduce(function(filas, q){
      return filas.concat(q.detenciones.map(function(c){
        return "<tr><td>" + esc(c.categoria) + "</td><td>" + q.trimestre +
          '</td><td class="n tabular">' + c.dias.toFixed(2) +
          '</td><td class="n tabular">' + c.eventos +
          '</td><td class="n tabular">' + Math.round(c.costo).toLocaleString("es-CL") + "</td></tr>";
      }));
    }, []).join("") || '<tr><td colspan="5" class="text-3">Sin detenciones registradas.</td></tr>';

    // ── clima ──
    var causas = {};
    qs.forEach(function(q){
      q.clima.forEach(function(c){
        causas[c.causa] = causas[c.causa] || {};
        causas[c.causa][q.trimestre] = c.dias;
      });
    });
    var nombresCausa = Object.keys(causas);
    if(nombresCausa.length){
      G.barrasAgrupadas($("g-temp-clima"), nombresCausa.map(function(c){
        return {nombre: c, valores: qs.map(function(q){ return causas[c][q.trimestre] || 0; })};
      }), qs.map(function(q, i){
        return {nombre: q.trimestre, color: [SERIE.nocontrolable, SERIE.efectiva, SERIE.controlable][i % 3]};
      }), {fmt: function(v){ return v.toFixed(1) + " d"; }});
      $("temp-clima-nota").textContent = t.diasClima.toFixed(1) + " días perdidos por clima";
    }else{
      G.barrasAgrupadas($("g-temp-clima"), [], []);
      $("temp-clima-nota").textContent = "el libro no trae la hoja de clima";
    }

    renderAtribucion(qs);
    renderExposicion();
    renderPorNave(v);
    renderTablaTemporada(qs);
    renderPlan();
  }

  /**
   * A qué se atribuye la espera, según los comentarios del libro.
   * "Sin atribuir" se muestra con el mismo peso que las demás: en 2026 es la
   * mayor, y esconderla daría una foto falsa de lo que está explicado.
   */
  function renderAtribucion(qs){
    var a = TRI.atribucion(qs);
    if(!a.length){
      G.barras($("g-temp-atribucion"), []);
      $("temp-atrib-nota").textContent = "sin demurrage que atribuir";
      $("temp-atrib-aviso").innerHTML = "";
      return;
    }
    G.barras($("g-temp-atribucion"), a.map(function(x){
      return {nombre: x.causa + " · " + x.naves + (x.naves === 1 ? " nave" : " naves"), valor: x.monto};
    }), {color: CRITICO,
         fmtValor: function(v){ return usdCompacto(v); },
         fmtEje:   function(v){ return usdCompacto(v); }});

    var sin = a.filter(function(x){ return x.causa === TRI.SIN_ATRIBUIR; })[0];
    var total = a.reduce(function(m, x){ return m + x.monto; }, 0);
    $("temp-atrib-nota").textContent = "sobre " + usdCompacto(total) + " de demurrage";
    $("temp-atrib-aviso").innerHTML = sin
      ? '<div class="aviso warn">' + esc(usdCompacto(sin.monto) + " (" +
          Math.round(sin.monto / total * 100) + " %) está sin atribuir: " + sin.naves +
          " recaladas sin comentario en el libro, y son las más caras. " +
          "Escribir la causa al liquidar es lo que convierte esta cifra en algo con lo que negociar.") +
        "</div>"
      : "";
  }

  /** Supuestos del cálculo de exposición, tomados del formulario. */
  function supuestosExposicion(){
    return {
      tasaEmbarque: num("expo-tasa") || 30000,
      rate: num("expo-rate") || TRI.rateTipico(temporada ? temporada.trimestres : []),
      descuento: $("expo-desc").value === "" ? 1.13 : num("expo-desc")
    };
  }

  function renderExposicion(){
    if(!temporada) return;
    var plan = temporada.datos.plan || [];
    if(!$("expo-rate").value){
      $("expo-rate").value = Math.round(TRI.rateTipico(temporada.trimestres)) || "";
    }
    var ex = TRI.exposicionPlan(plan, supuestosExposicion());
    var calc = ex.filter(function(e){ return e.calculable; });

    G.barras($("g-temp-exposicion"), calc.map(function(e){
      return {nombre: e.nave + (e.amarreFueraDeLaycan ? " ⚠" : ""), valor: e.exposicion};
    }), {color: AVISO,
         fmtValor: function(v){ return v > 0 ? usdCompacto(v) : "—"; },
         fmtEje:   function(v){ return usdCompacto(v); }});

    var total = calc.reduce(function(m, e){ return m + e.exposicion; }, 0);
    var expuestas = calc.filter(function(e){ return e.exposicion > 0; }).length;
    $("t-expo").textContent = total > 0 ? usdCompacto(total) : "—";
    $("t-expo-sub").textContent = calc.length
      ? expuestas + " de " + calc.length + " recaladas del plan"
      : "sin plan cargado";
    $("kpi-t-expo").style.borderTopColor = expuestas ? AVISO : "var(--cmp-blue-500)";
    $("temp-expo-nota").textContent = expuestas
      ? expuestas + " de " + calc.length + " recaladas expuestas · " + usdCompacto(total)
      : "ninguna recalada del plan queda expuesta";

    $("tb-exposicion").innerHTML = ex.map(function(e){
      if(!e.calculable){
        return "<tr><td>" + esc(e.nave) + '</td><td colspan="5" class="text-3">sin fechas suficientes en el plan</td></tr>';
      }
      return "<tr>" +
        "<td" + (e.amarreFueraDeLaycan ? ' style="color:' + CRITICO + '"' : "") + ">" +
          esc(e.nave) + (e.amarreFueraDeLaycan ? " · amarre fuera del laycan" : "") + "</td>" +
        '<td class="n tabular">' + (e.tonelaje ? Math.round(e.tonelaje).toLocaleString("es-CL") : "—") + "</td>" +
        '<td class="n tabular">' + (e.espera == null ? "—" : e.espera.toFixed(1) + " d") + "</td>" +
        '<td class="n tabular">' + e.allowed.toFixed(2) + " d</td>" +
        '<td class="n tabular">' + e.contado.toFixed(2) + " d</td>" +
        '<td class="n tabular" style="color:' + (e.exposicion > 0 ? AVISO : OK) + '">' +
          (e.exposicion > 0 ? usd(e.exposicion) : "—") + "</td>" +
        "</tr>";
    }).join("") || '<tr><td colspan="6" class="text-3">El libro no trae plan de embarque.</td></tr>';
  }

  /**
   * Lo que antes vivía en la pestaña Flota, ahora sobre las recaladas del
   * libro de reportería: son 33 con su demurrage liquidado, contra las que el
   * usuario alcanzara a cargar suelta desde los CNN-EMB.
   */
  function renderPorNave(v){
    var recs = [];
    v.trimestres.forEach(function(q){ recs = recs.concat(q.recaladas); });
    var tiempos = {};
    (v.datos.tiempos || []).forEach(function(t){
      tiempos[t.trimestre + "|" + t.nave.toUpperCase().trim()] = t;
    });
    var deT = function(r){ return tiempos[r.trimestre + "|" + String(r.nave).toUpperCase().trim()]; };

    // ── estadía: del NOR al término de carguío, con el amarre marcando el corte
    var conFechas = recs.filter(function(r){ return r.nor && r.finCarga; });
    G.gantt($("g-temp-gantt"), conFechas.map(function(r){
      var seg = [];
      if(r.atb && r.atb > r.nor) seg.push({desde:r.nor, hasta:r.atb, color:CRITICO, nombre:"Espera al amarre"});
      seg.push({desde: r.atb && r.atb > r.nor ? r.atb : r.nor, hasta: r.finCarga,
                color: SERIE.efectiva, nombre: "Amarrada y cargando"});
      return {nombre: r.nave + " · " + r.trimestre, segmentos: seg};
    }), {banda: 22});
    $("ley-temp-gantt").innerHTML =
      '<div class="ley-item"><span class="ley-sw" style="background:'+CRITICO+'"></span>Espera entre el NOR y el amarre</div>' +
      '<div class="ley-item"><span class="ley-sw" style="background:'+SERIE.efectiva+'"></span>Amarrada y cargando</div>';
    $("temp-gantt-nota").textContent = conFechas.length + " naves con fechas completas";

    // ── demurrage contra despatch, nave por nave
    G.divergentes($("g-temp-divergentes"), recs.map(function(r){
      return {nombre: r.nave, valor: r.demurrage > 0 ? r.demurrage : -Math.abs(r.despatch)};
    }).filter(function(x){ return x.valor !== 0; })
      .sort(function(a, b){ return b.valor - a.valor; }),
      {fmt: function(v){ return usdCompacto(Math.abs(v)); }, banda: 22});

    // ── rate de carga alcanzado, contra la tasa del contrato
    /* `lineas` rotula por `etiqueta` y abrevia con `corta`: con 33 naves el
       eje no admite el nombre entero. */
    var rates = recs.map(function(r){
      var t = deT(r);
      if(!t || !(t.tasaDiaria > 0)) return null;
      return {etiqueta: r.nave + " · " + r.trimestre,
              corta: String(r.nave).split(/\s+/)[0].slice(0, 8),
              valor: t.tasaDiaria};
    }).filter(Boolean);
    var pactada = 0;
    (v.datos.tiempos || []).forEach(function(t){ if(t.tasaContrato > 0) pactada = t.tasaContrato; });
    G.lineas($("g-temp-rate"), rates, {
      referencia: pactada || undefined,
      desdeCero: false,
      fmtEje:   function(x){ return Math.round(x/1000) + " k"; },
      fmtValor: function(x){ return Math.round(x).toLocaleString("es-CL") + " t/d"; }
    });
    $("temp-rate-nota").textContent = pactada
      ? "línea gris: tasa pactada de " + Math.round(pactada).toLocaleString("es-CL") + " t/día"
      : "t/día alcanzados";

    // ── la espera, recalada por recalada: la variable que decide
    var esperas = recs.map(function(r){
      var d = TRI.diasEntre(r.nor, r.atb);
      return d == null ? null : {nombre: r.nave, valor: d};
    }).filter(Boolean).sort(function(a, b){ return b.valor - a.valor; });
    G.barras($("g-temp-esperas"), esperas.slice(0, 12), {
      color: CRITICO,
      fmtValor: function(x){ return x.toFixed(1) + " d"; },
      fmtEje:   function(x){ return x.toFixed(0) + " d"; }
    });
    $("temp-espera-nota").textContent = esperas.length > 12
      ? "las 12 mayores de " + esperas.length + " · días entre NOR y amarre"
      : "días entre el NOR y el amarre";
  }

  function renderTablaTemporada(qs){
    var filas = [];
    qs.forEach(function(q){
      q.recaladas.forEach(function(r){
        var estado = TRI.estadoLaycan(r);
        var espera = TRI.diasEntre(r.nor, r.atb);
        var colorLaycan = estado === "tarde" ? CRITICO : estado === "antes" ? AVISO : "";
        filas.push("<tr>" +
          "<td>" + q.trimestre + "</td>" +
          "<td>" + esc(r.nave) + "</td>" +
          "<td>" + esc(r.inco || "—") + "</td>" +
          '<td class="n tabular">' + (r.cargo ? Math.round(r.cargo).toLocaleString("es-CL") : "—") + "</td>" +
          '<td' + (colorLaycan ? ' style="color:' + colorLaycan + '"' : "") + ">" + (estado || "—") + "</td>" +
          '<td class="n tabular">' + (espera == null ? "—" : espera.toFixed(1) + " d") + "</td>" +
          '<td class="n tabular">' + (r.rate ? Math.round(r.rate).toLocaleString("es-CL") : "—") + "</td>" +
          '<td class="n tabular" style="color:' + (r.demurrage ? CRITICO : "") + '">' +
            (r.demurrage ? Math.round(r.demurrage).toLocaleString("es-CL") : "—") + "</td>" +
          '<td class="n tabular" style="color:' + (r.despatch ? OK : "") + '">' +
            (r.despatch ? Math.round(Math.abs(r.despatch)).toLocaleString("es-CL") : "—") + "</td>" +
          "</tr>");
      });
    });
    $("tb-temporada").innerHTML = filas.join("") ||
      '<tr><td colspan="9" class="text-3">Sin recaladas.</td></tr>';
    var laycan = {antes:0, dentro:0, tarde:0};
    qs.forEach(function(q){
      laycan.antes += q.laycan.antes; laycan.dentro += q.laycan.dentro; laycan.tarde += q.laycan.tarde;
    });
    $("temp-tabla-nota").textContent = "laycan: " + laycan.dentro + " dentro · " +
      laycan.antes + " antes · " + laycan.tarde + " después";
  }

  /** Diagrama del plan: la ventana de laycan de cada nave que viene. */
  function renderPlan(){
    var plan = (temporada && temporada.datos.plan) || [];
    var conFechas = plan.filter(function(p){ return p.laycanDesde && p.laycanHasta; });
    if(!conFechas.length){
      $("g-temp-plan").innerHTML = "";
      $("ley-temp-plan").innerHTML = "";
      $("temp-plan-nota").textContent = "el libro no trae plan de embarque con fechas";
      return;
    }
    G.gantt($("g-temp-plan"), conFechas.map(function(p){
      var segmentos = [{desde: p.laycanDesde, hasta: p.laycanHasta, color: SERIE.nocontrolable, nombre: "Laycan"}];
      // El ETB dentro de la ventana es lo esperable; fuera, es la nave que ya
      // se sabe que va a esperar, y es la que conviene mirar antes de que pase.
      if(p.etb) segmentos.push({desde: p.etb, hasta: p.etd || p.etb,
        color: p.etb > p.laycanHasta ? CRITICO : SERIE.efectiva, nombre: "Estadía prevista"});
      return {nombre: p.nave + (p.tonelaje ? " · " + Math.round(p.tonelaje/1000) + " kt" : ""), segmentos: segmentos};
    }), {});
    $("ley-temp-plan").innerHTML =
      '<div class="ley-item"><span class="ley-sw" style="background:'+SERIE.nocontrolable+'"></span>Ventana de laycan</div>' +
      '<div class="ley-item"><span class="ley-sw" style="background:'+SERIE.efectiva+'"></span>Estadía prevista en ventana</div>' +
      '<div class="ley-item"><span class="ley-sw" style="background:'+CRITICO+'"></span>Amarre previsto fuera del laycan</div>';
    var fuera = conFechas.filter(function(p){ return p.etb && p.etb > p.laycanHasta; }).length;
    $("temp-plan-nota").textContent = conFechas.length + " recaladas planificadas" +
      (fuera ? " · " + fuera + " con amarre previsto fuera del laycan" : "");
  }

  /* ──────────────────────────── vistas ─────────────────────────── */

  function verVista(cual){
    $("vista-dashboard").hidden = cual !== "dashboard";
    $("vista-temporada").hidden = cual !== "temporada";
    $("vista-clima").hidden = cual !== "clima";
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){
      t.classList.toggle("on", t.dataset.vista === cual);
    });
    window.scrollTo(0, 0);
    /* Las fichas que se pintaron con el dashboard oculto no tenían ancho que
       medir, así que la cifra quedó sin ajustar. Al volver a mostrarlo hay
       ancho: se remide. */
    if(cual === "dashboard") ["k-demurrage","k-despatch","k-eta"].forEach(function(id){ ajustarCifra($(id)); });
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
    var b = $("bl-datos");
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

  /** Muestra una de las tres sub-pestañas del bloque de datos. */
  function verSubpanel(id){
    Array.prototype.forEach.call(document.querySelectorAll("#bl-datos .subpane"), function(p){
      p.hidden = p.id !== id;
    });
    Array.prototype.forEach.call(document.querySelectorAll("#bl-datos .subtab"), function(t){
      t.classList.toggle("on", t.dataset.panel === id);
    });
  }

  function enfocarRecalada(){
    verVista("dashboard");
    var b = $("bl-datos");
    if(!b) return;
    b.open = true;
    verSubpanel("pane-recalada");
    b.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function alternarPermitido(){
    var porTasa = $("modoPermitido").value === "tasa";
    $("campo-tasa").hidden = !porTasa;
    $("campo-horas").hidden = porTasa;
  }

  function alternarDespatch(){
    var porTarifa = $("modoDespatch").value === "tarifa";
    $("campo-pct-despatch").hidden = porTarifa;
    $("campo-tarifa-despatch").hidden = !porTarifa;
  }

  /* ─────────────────────────── eventos ─────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function(t){
    t.addEventListener("click", function(){
      verVista(t.dataset.vista);
      // Los gráficos se miden contra el panel: hay que dibujar ya visible.
      if(t.dataset.vista === "dashboard") calcular();
      if(t.dataset.vista === "clima"){
        if(serieClima.length) renderClima(); else consultarClima();
      }else if(t.dataset.vista === "temporada"){
        if(temporada) aplicarFiltro();
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
  /* Cada campo recalcula al editarlo.
     Sin esto, cambiar el demurrage rate no hacía nada visible hasta apretar
     "Calcular", y el valor ni siquiera se guardaba —guardar() vive dentro de
     calcular()—, así que al recargar volvía al anterior. Un dato que se
     escribe y no se ve reflejado se lee como que la app no lo tomó.
     `change` cubre el salir del campo y los desplegables; `input` con
     retardo cubre el escribir mirando la cifra, sin recalcular por tecla. */
  (function(){
    var pendiente = null;
    function recalcularConRetardo(){
      clearTimeout(pendiente);
      pendiente = setTimeout(calcular, 400);
    }
    CAMPOS.forEach(function(id){
      var el = $(id);
      if(!el || id.indexOf("rte") === 0) return;   // los rte* no se editan
      el.addEventListener("change", function(){ clearTimeout(pendiente); calcular(); });
      if(el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.addEventListener("input", recalcularConRetardo);
    });
    $("aplicaDespatch").addEventListener("change", calcular);
  })();

  $("btn-calcular").addEventListener("click", function(){ calcular(); });
  $("modoPermitido").addEventListener("change", function(){ alternarPermitido(); calcular(); });
  $("modoDespatch").addEventListener("change", function(){ alternarDespatch(); calcular(); });
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

  Array.prototype.forEach.call(document.querySelectorAll("#bl-datos .subtab"), function(t){
    t.addEventListener("click", function(){ verSubpanel(t.dataset.panel); });
  });

  $("filtro-trimestre").addEventListener("change", function(e){
    filtroTemporada.trimestre = e.target.value; aplicarFiltro();
  });
  $("filtro-mes").addEventListener("change", function(e){
    filtroTemporada.mes = e.target.value; aplicarFiltro();
  });
  $("btn-filtro-limpiar").addEventListener("click", function(){
    filtroTemporada = {trimestre:"", mes:""};
    pintarFiltros(); aplicarFiltro();
  });

  ["expo-tasa","expo-rate","expo-desc"].forEach(function(id){
    $(id).addEventListener("change", function(){ if(temporada) renderExposicion(); });
  });

  (function(){
    var zona = $("soltar-rep");
    if(!zona) return;
    zona.addEventListener("click", function(){ $("archivo-rep").click(); });
    $("archivo-rep").addEventListener("change", function(e){
      leerLibroReporteria(e.target.files[0]); e.target.value = "";
    });
    ["dragenter","dragover"].forEach(function(ev){
      zona.addEventListener(ev, function(e){ e.preventDefault(); zona.classList.add("sobre"); });
    });
    ["dragleave","drop"].forEach(function(ev){
      zona.addEventListener(ev, function(e){ e.preventDefault(); zona.classList.remove("sobre"); });
    });
    zona.addEventListener("drop", function(e){
      if(e.dataTransfer.files.length) leerLibroReporteria(e.dataTransfer.files[0]);
    });
  })();

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
  if(restaurarTemporada()) { /* se dibuja al abrir la pestaña */ }
  var habia = restaurar();
  alternarPermitido();
  alternarDespatch();
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
