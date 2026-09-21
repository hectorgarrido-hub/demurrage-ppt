/**
 * Configuración de la sincronización en la nube.
 *
 * Esto viaja con el sitio, así que vale para todos los que abran el enlace.
 * Es lo que hace que compartir la URL sirva de algo: la configuración que se
 * escribe en la pantalla de Sincronización se guarda en el navegador de quien
 * la escribió y no llega a nadie más —quien abría el link con el almacenamiento
 * vacío veía la app sin proyecto, sin login y sin datos.
 *
 * Lo guardado en el navegador tiene prioridad sobre esto, para poder apuntar a
 * otro proyecto sin tocar el archivo.
 *
 * La clave publicable es pública por diseño: quien abra el sitio la ve, y por
 * eso está acá sin problema. Lo que protege los datos son las políticas RLS de
 * supabase/esquema.sql, que exigen usuario autenticado, más la sesión de cada
 * persona. Si alguna vez esas políticas volvieran a permitir el rol `anon`,
 * esta clave abriría la tabla a cualquiera: la comprobación está al pie del
 * propio esquema.
 *
 * Acá NUNCA va la clave secreta (sb_secret_… / service_role). La app se niega
 * a aceptarla, pero este archivo no pasa por esa validación.
 */
window.CONFIG_NUBE = {
  url: "https://gjrskjsoylozdwnjwwkr.supabase.co",
  anonKey: "sb_publishable_eUmf1bW0JyJW7AvHaU06Cg_tN8-IXQh",
  tabla: "demurrage_embarques"
};
