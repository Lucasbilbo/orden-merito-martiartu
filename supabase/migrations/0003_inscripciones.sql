-- YA APLICADA el 29/10/2026 en Supabase. Inscripciones a torneos (fase 2). Solo añade: no borra ni cambia datos existentes.
--
-- Modelo:
--   tournaments  + signup_opens_at, signup_closes_at, max_players, signup_notes, tee_times_published
--   signups      una fila por inscripción. Privada: el público no la lee directamente.
-- Funciones públicas (sin login):
--   signup_status(t)        estado de la inscripción del torneo y nº de inscritos
--   signup_list(t)          lista pública: solo nombre, estado y horario (si está publicado)
--   signup_create(...)      apuntarse (jugador de la Orden o invitado); devuelve el enlace para anular
--   signup_lookup(token)    ver la propia inscripción
--   signup_cancel(token)    anularla; si había reserva, el primero pasa a inscrito
-- El admin gestiona todo desde la tabla signups (política "escritura admin").

-- 1. Configuración de inscripción por torneo ------------------------------------
alter table public.tournaments add column if not exists signup_opens_at timestamptz;
alter table public.tournaments add column if not exists signup_closes_at timestamptz;
alter table public.tournaments add column if not exists max_players int check (max_players is null or max_players > 0);
alter table public.tournaments add column if not exists signup_notes text;
alter table public.tournaments add column if not exists tee_times_published boolean not null default false;

-- 2. Inscripciones -----------------------------------------------------------------
create table if not exists public.signups (
  id bigint generated always as identity primary key,
  tournament_id int not null references public.tournaments(id) on delete cascade,
  player_id int references public.players(id) on delete set null,
  nombre text not null check (length(trim(nombre)) between 2 and 80),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9+ ()-]{6,20}$'),
  hcp numeric(3,1) check (hcp is null or hcp between -10 and 54),
  comment text check (comment is null or length(comment) <= 300),
  status text not null default 'inscrito' check (status in ('inscrito', 'reserva', 'anulado')),
  tee_time text check (tee_time is null or length(tee_time) <= 40),
  cancel_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- El contacto es obligatorio al apuntarse desde la web (lo exige signup_create), no para el admin.
);
create index if not exists signups_tournament_idx on public.signups(tournament_id, status, created_at);
-- Un jugador de la Orden no puede estar dos veces activo en el mismo torneo
create unique index if not exists signups_player_once on public.signups(tournament_id, player_id)
  where player_id is not null and status <> 'anulado';

alter table public.signups enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'signups' and policyname = 'escritura admin') then
    create policy "escritura admin" on public.signups for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
grant usage, select on all sequences in schema public to authenticated;

-- 3. Estado de la inscripción de un torneo -------------------------------------------
-- estado: 'sin_abrir' | 'abierta' | 'cerrada' | 'no_hay' (no se ha configurado)
create or replace function public.signup_status(p_tournament_id int)
returns table(estado text, abre timestamptz, cierra timestamptz, plazas int, inscritos int, reservas int,
              notas text, horarios boolean)
language sql stable security definer set search_path = public as $$
  select
    case
      when t.signup_opens_at is null then 'no_hay'
      when now() < t.signup_opens_at then 'sin_abrir'
      when now() >= coalesce(t.signup_closes_at, t.date::timestamptz) then 'cerrada'
      else 'abierta'
    end,
    t.signup_opens_at, coalesce(t.signup_closes_at, t.date::timestamptz), t.max_players,
    (select count(*)::int from signups s where s.tournament_id = t.id and s.status = 'inscrito'),
    (select count(*)::int from signups s where s.tournament_id = t.id and s.status = 'reserva'),
    t.signup_notes, t.tee_times_published
  from tournaments t where t.id = p_tournament_id
$$;

-- 4. Lista pública (solo nombres) -------------------------------------------------------
create or replace function public.signup_list(p_tournament_id int)
returns table(orden int, nombre text, estado text, horario text)
language sql stable security definer set search_path = public as $$
  select row_number() over (partition by s.status order by s.created_at, s.id)::int,
         s.nombre, s.status,
         case when t.tee_times_published then s.tee_time end
  from signups s join tournaments t on t.id = s.tournament_id
  where s.tournament_id = p_tournament_id and s.status <> 'anulado'
  order by s.status = 'reserva', case when t.tee_times_published then s.tee_time end nulls last, s.created_at, s.id
$$;

-- 5. Apuntarse -------------------------------------------------------------------------
create or replace function public.signup_create(
  p_tournament_id int, p_player_id int, p_nombre text, p_email text, p_phone text, p_hcp numeric, p_comment text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_t tournaments%rowtype;
  v_nombre text;
  v_email text := nullif(lower(trim(p_email)), '');
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g'), '');
  v_status text;
  v_row signups%rowtype;
begin
  select * into v_t from tournaments where id = p_tournament_id for update;
  if not found then raise exception 'El torneo no existe' using errcode = 'P0002'; end if;
  if v_t.signup_opens_at is null or now() < v_t.signup_opens_at then
    raise exception 'La inscripción de este torneo todavía no está abierta' using errcode = 'P0001';
  end if;
  if now() >= coalesce(v_t.signup_closes_at, v_t.date::timestamptz) then
    raise exception 'La inscripción de este torneo ya está cerrada' using errcode = 'P0001';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Deja un correo o un teléfono para poder avisarte' using errcode = 'P0001';
  end if;

  if p_player_id is not null then
    select concat_ws(' ', nombre, apellido1, apellido2) into v_nombre from players where id = p_player_id;
    if v_nombre is null then raise exception 'Jugador no encontrado' using errcode = 'P0001'; end if;
  else
    v_nombre := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
    if length(v_nombre) < 4 or v_nombre !~ ' ' then
      raise exception 'Escribe nombre y apellidos' using errcode = 'P0001';
    end if;
  end if;

  -- Evitar duplicados: mismo jugador o mismo nombre ya activo en el torneo
  if exists (
    select 1 from signups s
    where s.tournament_id = p_tournament_id and s.status <> 'anulado'
      and ((p_player_id is not null and s.player_id = p_player_id) or lower(s.nombre) = lower(v_nombre))
  ) then
    raise exception '% ya está inscrito en este torneo', v_nombre using errcode = 'P0001';
  end if;
  -- Freno básico contra abusos
  if (select count(*) from signups where tournament_id = p_tournament_id) >= 300 then
    raise exception 'Demasiadas inscripciones en este torneo; avisa al organizador' using errcode = 'P0001';
  end if;

  v_status := case
    when v_t.max_players is not null
     and (select count(*) from signups where tournament_id = p_tournament_id and status = 'inscrito') >= v_t.max_players
    then 'reserva' else 'inscrito' end;

  insert into signups(tournament_id, player_id, nombre, email, phone, hcp, comment, status)
  values (p_tournament_id, p_player_id, v_nombre, v_email, v_phone, p_hcp, nullif(trim(p_comment), ''), v_status)
  returning * into v_row;

  return jsonb_build_object('estado', v_row.status, 'nombre', v_row.nombre, 'token', v_row.cancel_token);
end $$;

-- 6. Consultar la propia inscripción -------------------------------------------------
create or replace function public.signup_lookup(p_token uuid)
returns table(tournament_id int, torneo text, fecha date, nombre text, estado text, horario text, puede_anular boolean)
language sql stable security definer set search_path = public as $$
  select t.id, coalesce(t.course, t.name), t.date, s.nombre, s.status,
         case when t.tee_times_published then s.tee_time end,
         s.status <> 'anulado' and now() < t.date::timestamptz
  from signups s join tournaments t on t.id = s.tournament_id
  where s.cancel_token = p_token
$$;

-- 7. Anular --------------------------------------------------------------------------
create or replace function public.signup_cancel(p_token uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_row signups%rowtype;
  v_date date;
  v_max int;
  v_promoted text;
begin
  select * into v_row from signups where cancel_token = p_token for update;
  if not found then raise exception 'Inscripción no encontrada' using errcode = 'P0002'; end if;
  select date, max_players into v_date, v_max from tournaments where id = v_row.tournament_id for update;
  if now() >= v_date::timestamptz then
    raise exception 'El torneo ya ha empezado; avisa al organizador' using errcode = 'P0001';
  end if;
  if v_row.status = 'anulado' then
    return jsonb_build_object('estado', 'anulado', 'ya_estaba', true);
  end if;

  update signups set status = 'anulado', updated_at = now() where id = v_row.id;

  -- Si deja una plaza libre, sube el primero de la reserva
  if v_row.status = 'inscrito' then
    update signups set status = 'inscrito', updated_at = now()
    where id = (
      select id from signups
      where tournament_id = v_row.tournament_id and status = 'reserva'
      order by created_at, id limit 1
    )
    and (v_max is null or (select count(*) from signups where tournament_id = v_row.tournament_id and status = 'inscrito') < v_max)
    returning nombre into v_promoted;
  end if;

  return jsonb_build_object('estado', 'anulado', 'sube_de_reserva', v_promoted);
end $$;

-- 8. Permisos de las funciones públicas ----------------------------------------------
revoke all on function public.signup_status(int) from public;
revoke all on function public.signup_list(int) from public;
revoke all on function public.signup_create(int, int, text, text, text, numeric, text) from public;
revoke all on function public.signup_lookup(uuid) from public;
revoke all on function public.signup_cancel(uuid) from public;
grant execute on function public.signup_status(int) to anon, authenticated;
grant execute on function public.signup_list(int) to anon, authenticated;
grant execute on function public.signup_create(int, int, text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.signup_lookup(uuid) to anon, authenticated;
grant execute on function public.signup_cancel(uuid) to anon, authenticated;
