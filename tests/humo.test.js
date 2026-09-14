/**
 * Prueba de humo: abre la app en un navegador real y la recorre entera,
 * fallando si el navegador lanza un solo error.   node tests/humo.test.js
 *
 * Existe por un error que llegó publicado. Al retirar la vista Flota se borró
 * de paso `var serieClima = []`, que vivía entre sus funciones. El archivo
 * seguía siendo JavaScript válido —`node --check` pasaba—, las 414 pruebas
 * pasaban porque ninguna toca el DOM, y las comprobaciones de navegador que
 * corrí después miraban otras pestañas. El defecto solo aparecía al apretar
 * "Consultar condiciones", y lo encontró el usuario: "serieClima is not
 * defined".
 *
 * Un error de referencia no se ve leyendo; se ve ejecutando. Esta prueba
 * ejecuta: abre cada pestaña, carga un libro, aprieta los botones que
 * disparan cada render y exige cero errores de página.
 *
 * Necesita Playwright y un servidor local. Si falta alguno se omite sin
 * fallar, para que la suite siga corriendo donde no hay navegador.
 */
var fs = require("fs"), path = require("path"), http = require("http");
var raiz = path.join(__dirname, "..");

var chromium;
try { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
catch(e){
  try { chromium = require("playwright").chromium; }
  catch(e2){
    console.log("\nPrueba de humo omitida: Playwright no está disponible.");
    process.exit(0);
  }
}

var TIPOS = {".html":"text/html", ".js":"application/javascript", ".css":"text/css"};

function servir(){
  return new Promise(function(listo){
    var srv = http.createServer(function(req, res){
      var rel = decodeURIComponent(req.url.split("?")[0]);
      if(rel === "/") rel = "/index.html";
      var f = path.join(raiz, rel);
      if(!f.startsWith(raiz) || !fs.existsSync(f)){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, {"Content-Type": TIPOS[path.extname(f)] || "application/octet-stream"});
      res.end(fs.readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", function(){ listo({srv: srv, puerto: srv.address().port}); });
  });
}

var fallas = 0, total = 0;
function chequear(nombre, ok, detalle){
  total++;
  if(!ok) fallas++;
  console.log((ok ? "  PASS " : "  FALLA") + " | " + nombre + (detalle ? " -> " + detalle : ""));
}

(async function(){
  var s = await servir();
  var base = "http://127.0.0.1:" + s.puerto + "/index.html";
  var navegador = await chromium.launch();
  var pagina = await navegador.newPage({viewport:{width:1600, height:1000}});

  var errores = [];
  pagina.on("pageerror", function(e){ errores.push(e.message); });
  pagina.on("console", function(m){
    // Google Fonts y la API del clima no están disponibles sin red: sus
    // fallos de carga no son defectos de la app.
    if(m.type() === "error" && !/fonts|ERR_|Failed to load resource/.test(m.text())){
      errores.push("console: " + m.text());
    }
  });

  function sinErrores(paso){
    var hubo = errores.splice(0);
    chequear(paso, hubo.length === 0, hubo.length ? hubo.join(" | ") : "sin errores");
  }

  console.log("\nRecorrido de la app en un navegador real");
  await pagina.goto(base, {waitUntil: "networkidle"});
  sinErrores("carga inicial");

  // Cada pestaña dispara su propio render.
  var pestanas = await pagina.$$eval(".tab", function(ns){
    return ns.map(function(n){ return n.dataset.vista; });
  });
  for(var i = 0; i < pestanas.length; i++){
    await pagina.click('.tab[data-vista="' + pestanas[i] + '"]');
    await pagina.waitForTimeout(500);
    sinErrores("abrir pestaña " + pestanas[i]);
  }

  // El clima sin red tiene que fallar con un aviso, no con una excepción.
  await pagina.click('.tab[data-vista="clima"]');
  await pagina.waitForTimeout(300);
  await pagina.click("#btn-clima-consultar");
  await pagina.waitForTimeout(1500);
  sinErrores("consultar condiciones sin red");
  var aviso = await pagina.$eval("#clima-aviso", function(n){ return n.textContent.trim(); });
  chequear("el clima avisa en vez de reventar", aviso.length > 0 && !/is not defined/.test(aviso),
    aviso.slice(0, 80) || "(sin aviso)");
  await pagina.click("#btn-clima-umbrales");
  await pagina.waitForTimeout(300);
  sinErrores("abrir umbrales del clima");

  // El dashboard, con una recalada de verdad.
  await pagina.click('.tab[data-vista="dashboard"]');
  await pagina.waitForTimeout(300);
  var libro = path.join(__dirname, "fixtures", "recalada.xlsx");
  if(fs.existsSync(libro)){
    await pagina.setInputFiles("#archivo", libro);
    await pagina.waitForTimeout(1800);
    sinErrores("importar un libro CNN-EMB");

    await pagina.click("#bl-datos > summary"); await pagina.waitForTimeout(300);
    var solapas = await pagina.$$eval("#bl-datos .subtab", function(ns){
      return ns.map(function(n){ return n.dataset.panel; });
    });
    for(var j = 0; j < solapas.length; j++){
      await pagina.click('.subtab[data-panel="' + solapas[j] + '"]');
      await pagina.waitForTimeout(250);
      sinErrores("sub-pestaña " + solapas[j]);
    }
    // Volver a la solapa de la recalada: el botón vive ahí.
    await pagina.click('.subtab[data-panel="pane-recalada"]'); await pagina.waitForTimeout(250);
    await pagina.click("#btn-calcular"); await pagina.waitForTimeout(700);
    sinErrores("recalcular");

    await pagina.click("#btn-presentar"); await pagina.waitForTimeout(900);
    sinErrores("abrir modo presentación");
    await pagina.keyboard.press("ArrowRight"); await pagina.waitForTimeout(400);
    await pagina.keyboard.press("Escape"); await pagina.waitForTimeout(400);
    sinErrores("recorrer y cerrar la presentación");
  }else{
    console.log("  (sin tests/fixtures/recalada.xlsx: se omite la parte del dashboard)");
  }

  await navegador.close();
  s.srv.close();

  console.log("\n" + (fallas === 0 ? "TODO OK" : "HAY FALLAS") + ": " + (total - fallas) + "/" + total + " comprobaciones.");
  process.exit(fallas === 0 ? 0 : 1);
})().catch(function(e){
  console.log("\nLa prueba de humo no pudo completarse: " + e.message);
  process.exit(1);
});
