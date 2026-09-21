-- ============================================================
-- demurrage-ppt · tabla de embarques
-- Ejecutar en Supabase: SQL Editor → New query → Run.
-- ============================================================

create table if not exists public.demurrage_embarques (
  codigo          text primary key,          -- CNN-EMB-XXX: identifica la recalada
  nave            text,
  fecha           timestamptz,               -- 1ª espía (o inicio de carguío / NOR)
  campos          jsonb not null,            -- el formulario completo
  deducciones     jsonb not null default '[]'::jsonb,
  actualizado_en  timestamptz not null default now()
);

create index if not exists demurrage_embarques_fecha_idx
  on public.demurrage_embarques (fecha desc nulls last);

-- `actualizado_en` la escribe el cliente y NO la pisa el servidor.
-- La pregunta que decide un conflicto es "cuándo se editó este embarque", y eso
-- solo lo sabe quien lo editó: si el servidor pusiera now() en cada escritura,
-- una copia vieja subida después parecería la más nueva y ganaría.
-- Solo se rellena cuando llega nula.
create or replace function public.demurrage_fecha_por_defecto()
returns trigger language plpgsql as $$
begin
  if new.actualizado_en is null then
    new.actualizado_en = now();
  end if;

  -- Y no se retrocede: si llega una versión más vieja que la guardada, se
  -- ignora. Dos personas guardando a la vez producen peticiones que pueden
  -- llegar desordenadas, y sin esta guarda una copia vieja que aterriza
  -- última revive y borra la corrección de la otra.
  if TG_OP = 'UPDATE' and new.actualizado_en < old.actualizado_en then
    return old;
  end if;

  return new;
end $$;

drop trigger if exists demurrage_embarques_tocar on public.demurrage_embarques;
create trigger demurrage_embarques_tocar
  before insert or update on public.demurrage_embarques
  for each row execute function public.demurrage_fecha_por_defecto();

-- ─────────────────────────────────────────────────────────────
-- SEGURIDAD
--
-- La clave publicable viaja en el navegador: es pública por diseño. Lo único
-- que separa estos datos de cualquiera que abra el sitio son estas políticas.
--
-- En Settings → API Keys hay dos. Va la de arriba —«Publishable key»,
-- sb_publishable_… , o la «anon» de los proyectos antiguos—, nunca la
-- «Secret key» (sb_secret_… / service_role): esa salta RLS y en un sitio
-- público le daría acceso de administrador a todas las tablas del proyecto.
-- La aplicación se niega a guardarla, pero conviene saberlo antes de copiar.
--
-- La activa exige usuario autenticado. Con el sitio publicado en Netlify,
-- una política `to anon` significa que quien dé con la URL puede leer y
-- escribir montos de demurrage y tarifas de contrato; la obscuridad del
-- enlace no es una medida de seguridad.
--
-- Las cuentas se crean a mano en el panel de Supabase
-- (Authentication → Users → Add user), no desde la aplicación: una
-- pantalla de registro abierta en un sitio público es el mismo agujero
-- con otra forma. Conviene además apagar el auto-registro en
-- Authentication → Providers → Email → "Enable sign ups".
-- ─────────────────────────────────────────────────────────────

alter table public.demurrage_embarques enable row level security;

-- Solo usuarios autenticados. Los tres del equipo ven y editan lo mismo:
-- no hay dueño por fila porque un embarque no es de quien lo cargó, es del
-- terminal, y la segunda persona que abre la recalada tiene que poder
-- corregirla.
drop policy if exists demurrage_anon_todo   on public.demurrage_embarques;
drop policy if exists demurrage_auth_todo   on public.demurrage_embarques;
create policy demurrage_auth_todo
  on public.demurrage_embarques
  for all
  to authenticated
  using (true)
  with check (true);

-- Para comprobar que la puerta está cerrada, desde el SQL Editor:
--   set role anon;
--   select count(*) from public.demurrage_embarques;   -- debe dar 0 filas
--   reset role;
-- Si devuelve filas, quedó una política `to anon` viva: búscala con
--   select policyname, roles from pg_policies
--    where tablename = 'demurrage_embarques';
