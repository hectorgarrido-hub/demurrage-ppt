/**
 * Lector del Notice of Readiness de la agencia marítima (PDF).
 *
 * El parseo del texto está separado de la lectura del PDF a propósito: así la
 * parte frágil —interpretar un documento escaneado y firmado a mano— se puede
 * probar sin navegador.
 *
 * El texto que entrega pdf.js sobre el NOR real de la CHINA TRIUMPH trae
 * suciedad que hay que tolerar:
 *   - el año sale como "2O26", con letra O en vez de cero
 *   - la hora sale partida: "17: 36"
 *   - la fecha del NOR aceptado aparece después de la firma, no junto a su hora
 *   - hay glifos sueltos del sello y de la firma en medio del texto
 */
(function(global){
  "use strict";

  var MESES = {
    JANUARY:1, JAN:1, ENERO:1, FEBRUARY:2, FEB:2, FEBRERO:2, MARCH:3, MAR:3, MARZO:3,
    APRIL:4, APR:4, ABRIL:4, MAY:5, MAYO:5, JUNE:6, JUN:6, JUNIO:6, JULY:7, JUL:7, JULIO:7,
    AUGUST:8, AUG:8, AGOSTO:8, SEPTEMBER:9, SEP:9, SEPT:9, SEPTIEMBRE:9,
    OCTOBER:10, OCT:10, OCTUBRE:10, NOVEMBER:11, NOV:11, NOVIEMBRE:11,
    DECEMBER:12, DEC:12, DICIEMBRE:12
  };

  /** Normaliza el texto crudo: mayúsculas, espacios colapsados, sin glifos raros. */
  function normalizar(texto){
    return String(texto || "")
      .replace(/[^\x20-\x7EÀ-ſ]/g, " ")   // fuera sellos, firmas y CJK
      .replace(/\s+/g, " ")
      .toUpperCase()
      .trim();
  }

  /** "2O26" -> "2026": en documentos escaneados la O y el 0 se confunden. */
  function soloDigitos(t){
    return String(t).replace(/[OQD]/g, "0").replace(/[IL]/g, "1").replace(/[^0-9]/g, "");
  }

  /** Primera hora del fragmento. Tolera "17: 36" y "17 : 36". */
  function primeraHora(seg){
    var m = /(\d{1,2})\s*:\s*(\d{2})/.exec(seg || "");
    if(!m) return null;
    var h = +m[1], min = +m[2];
    if(h > 23 || min > 59) return null;
    return {h:h, m:min};
  }

  /** Primera fecha del fragmento, en formato "MES DD, AAAA". */
  function primeraFecha(seg){
    var re = /\b([A-ZÁÉÍÓÚ]{3,12})\s+([0-9OQDIL]{1,2})\s*[,.]?\s*([0-9OQDIL]{4})\b/g;
    var m;
    while((m = re.exec(seg || ""))){
      var mes = MESES[m[1]];
      if(!mes) continue;
      var dia = +soloDigitos(m[2]), anio = +soloDigitos(m[3]);
      if(!dia || dia > 31 || anio < 1990 || anio > 2100) continue;
      return {a:anio, m:mes, d:dia};
    }
    return null;
  }

  /** Une fecha y hora en el formato que espera un input datetime-local. */
  function aInput(fecha, hora){
    if(!fecha) return null;
    var h = hora || {h:0, m:0};
    return fecha.a + "-" + String(fecha.m).padStart(2,"0") + "-" + String(fecha.d).padStart(2,"0") +
           "T" + String(h.h).padStart(2,"0") + ":" + String(h.m).padStart(2,"0");
  }

  /** Fragmento entre dos marcas; si la primera no está, devuelve "". */
  function entre(t, desde, hasta){
    var i = t.search(desde);
    if(i < 0) return "";
    var resto = t.slice(i);
    if(hasta){
      var j = resto.slice(1).search(hasta);
      if(j >= 0) return resto.slice(0, j + 1);
    }
    return resto;
  }

  /**
   * Interpreta el texto de un NOR. Devuelve los hitos y los reparos
   * encontrados; nunca lanza.
   */
  function desdeTexto(texto){
    var t = normalizar(texto);
    var avisos = [];
    var r = {nave:null, viaje:null, arribo:null, freePratique:null,
             norPresentado:null, norAceptado:null, avisos:avisos, texto:t};

    if(!/NOTICE OF READINESS/.test(t)){
      avisos.push("El PDF no parece un Notice of Readiness: no se encontró ese encabezado.");
      return r;
    }

    var mNave = /VESSEL\s*:?\s*([A-Z0-9][A-Z0-9 .'\-]{2,40}?)\s+VOYAGE/.exec(t);
    if(mNave) r.nave = mNave[1].trim();
    var mViaje = /VOYAGE\s*N\s*['`´º°]?\s*:?\s*([0-9]{1,5})/.exec(t);
    if(mViaje) r.viaje = mViaje[1];

    /* Se corta por hitos y dentro de cada tramo se toma la primera hora y la
       primera fecha. Buscar por expresión regular de punta a punta falla: la
       fecha del NOR aceptado está después de la firma. */
    var segArribo   = entre(t, /ARRIVED AT THE/, /FREE PRATIQUE/);
    var segPratique = entre(t, /FREE PRATIQUE/, /NOTICE OF READINESS TENDERED|RESPECT READY/);
    var segTendered = entre(t, /NOTICE OF READINESS TENDERED/, /NOTICE OF READINESS ACCEPTED/);
    var segAceptado = entre(t, /NOTICE OF READINESS ACCEPTED/, null);

    r.arribo        = aInput(primeraFecha(segArribo),   primeraHora(segArribo));
    r.freePratique  = aInput(primeraFecha(segPratique), primeraHora(segPratique));
    r.norPresentado = aInput(primeraFecha(segTendered), primeraHora(segTendered));
    r.norAceptado   = aInput(primeraFecha(segAceptado), primeraHora(segAceptado));

    if(!r.norPresentado) avisos.push("No se pudo leer el NOR presentado (tendered).");
    if(!r.norAceptado)   avisos.push("No se pudo leer el NOR aceptado.");
    if(!r.arribo)        avisos.push("No se pudo leer la hora de arribo al puerto.");

    /* Coherencia cronológica: si no se cumple, casi siempre es un dígito mal
       leído, y un dígito mal leído aquí son miles de dólares de diferencia. */
    var orden = [["arribo", r.arribo], ["NOR presentado", r.norPresentado],
                 ["NOR aceptado", r.norAceptado]].filter(function(x){ return x[1]; });
    for(var i=1;i<orden.length;i++){
      if(orden[i][1] < orden[i-1][1]){
        avisos.push("El " + orden[i][0] + " (" + orden[i][1].replace("T"," ") + ") es anterior al " +
          orden[i-1][0] + " (" + orden[i-1][1].replace("T"," ") + "): revisa las fechas leídas.");
      }
    }
    return r;
  }

  /**
   * Lee un PDF con pdf.js y devuelve lo mismo que desdeTexto.
   * Requiere que pdfjsLib esté cargado y con su worker configurado.
   */
  function desdeArchivo(arrayBuffer){
    if(typeof pdfjsLib === "undefined"){
      return Promise.reject(new Error("El lector de PDF no está cargado (js/vendor/pdf.min.js)."));
    }
    return pdfjsLib.getDocument({data: new Uint8Array(arrayBuffer)}).promise.then(function(doc){
      var paginas = [];
      for(var i=1;i<=doc.numPages;i++) paginas.push(i);
      return paginas.reduce(function(cadena, n){
        return cadena.then(function(acc){
          return doc.getPage(n).then(function(pg){ return pg.getTextContent(); })
            .then(function(tc){
              return acc + " " + tc.items.map(function(it){ return it.str; }).join(" ");
            });
        });
      }, Promise.resolve("")).then(desdeTexto);
    });
  }

  /**
   * Parecido entre dos nombres de nave, de 0 a 1 (distancia de edición
   * normalizada). Sirve para separar un error de tipeo —el RTE de la
   * CNN-EMB-434 dice "CHINA THIUMPH" donde el NOR dice "CHINA TRIUMPH"— de
   * dos embarques distintos.
   */
  function parecido(a, b){
    a = normalizar(a).replace(/^MN\s+|^M\/?V\s+/, "");
    b = normalizar(b).replace(/^MN\s+|^M\/?V\s+/, "");
    if(!a || !b) return 0;
    if(a === b) return 1;
    var fila = [], i, j;
    for(j = 0; j <= b.length; j++) fila[j] = j;
    for(i = 1; i <= a.length; i++){
      var previa = fila[0]; fila[0] = i;
      for(j = 1; j <= b.length; j++){
        var temp = fila[j];
        fila[j] = Math.min(fila[j] + 1, fila[j-1] + 1,
                           previa + (a[i-1] === b[j-1] ? 0 : 1));
        previa = temp;
      }
    }
    return 1 - fila[b.length] / Math.max(a.length, b.length);
  }

  var api = {desdeTexto: desdeTexto, desdeArchivo: desdeArchivo, parecido: parecido,
             normalizar: normalizar, primeraFecha: primeraFecha, primeraHora: primeraHora};
  if(typeof module === "object" && module.exports) module.exports = api;
  else global.LeerNOR = api;

})(typeof window !== "undefined" ? window : globalThis);
