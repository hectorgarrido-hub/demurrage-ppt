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
-- SEGURIDAD — LEE ESTO ANTES DE EJECUTAR
--
-- La anon key viaja en el navegador: es pública por diseño. Lo único que
-- separa estos datos de cualquiera que abra el sitio son las políticas RLS.
--
-- OPCIÓN A (abajo, activa): cualquiera con la URL del sitio puede leer y
-- escribir embarques. Sirve para partir y para una herramienta interna cuyo
-- enlace no se difunde, pero acá hay montos de demurrage y tarifas de
-- contrato: no es lo mismo que un inventario de pilas.
--
-- OPCIÓN B (comentada más abajo): exige usuario autenticado. Es la que
-- corresponde si esto sale del equipo o si el sitio queda público en Netlify.
-- ─────────────────────────────────────────────────────────────

alter table public.demurrage_embarques enable row level security;

-- OPCIÓN A — acceso anónimo
drop policy if exists demurrage_anon_todo on public.demurrage_embarques;
create policy demurrage_anon_todo
  on public.demurrage_embarques
  for all
  to anon
  using (true)
  with check (true);

-- OPCIÓN B — solo usuarios autenticados (comentar la opción A antes de usar)
-- drop policy if exists demurrage_anon_todo on public.demurrage_embarques;
-- create policy demurrage_auth_todo
--   on public.demurrage_embarques
--   for all
--   to authenticated
--   using (true)
--   with check (true);
