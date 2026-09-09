/**
 * Configuración de la sincronización en la nube.
 *
 * Se puede dejar aquí —queda igual para todos los que abran el sitio— o
 * configurarla desde la app, en «Datos y contrato → Sincronización», que la
 * guarda en el navegador de cada persona y tiene prioridad sobre esto.
 *
 * La anon key de Supabase es pública por diseño: quien abra el sitio la ve.
 * Lo que protege los datos son las políticas RLS de supabase/esquema.sql.
 */
window.CONFIG_NUBE = {
  url: "",                            // https://xxxxxxxx.supabase.co
  anonKey: "",                        // anon public key del proyecto
  tabla: "demurrage_embarques"
};
