-- PENDIENTE DE APLICAR. Pegar entera en Supabase > SQL Editor > New query > Run.
-- Es idempotente en lo posible y NO borra datos: solo añade tablas, columnas, políticas y funciones.
--
-- Qué hace:
--   1. Administradores: tabla admins (solo el correo de Lucas) y función is_admin().
--   2. Escritura solo para el admin en todas las tablas (lectura pública como hasta ahora).
--   3. Los handicaps dejan de ser públicos (en público solo se ve el nombre).
--   4. Ids automáticos para jugadores y torneos nuevos.
--   5. Temporadas con reglas configurables (mejores N resultados y multiplicador de la final).
--   6. Handicap actual de cada jugador (privado).
--   7. season_board(): clasificación de la temporada con puntos por torneo y desempate por handicap.
--   8. save_tournament_results(): guarda de golpe los resultados de un torneo y calcula los puestos.

-- 1. Administradores -------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- Sin políticas: nadie puede leer ni escribir esta tabla desde la web.
insert into public.admins(email) values ('lucasbilbao.lucasbi@gmail.com') on conflict do nothing;

-- Admin = usuario autenticado, con el correo confirmado y presente en admins.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from auth.users u
    join public.admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. Escritura solo admin --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['players','player_private','tournaments','results','params','handicaps'] loop
    execute format('drop policy if exists "escritura admin" on public.%I', t);
    execute format(
      'create policy "escritura admin" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 3. Handicaps privados ----------------------------------------------------------
drop policy if exists "lectura publica" on public.handicaps;

-- 4. Ids automáticos -------------------------------------------------------------
create sequence if not exists public.players_id_seq owned by public.players.id;
select setval('public.players_id_seq', coalesce((select max(id) from public.players), 0) + 1, false);
alter table public.players alter column id set default nextval('public.players_id_seq');

create sequence if not exists public.tournaments_id_seq owned by public.tournaments.id;
select setval('public.tournaments_id_seq', coalesce((select max(id) from public.tournaments), 0) + 1, false);
alter table public.tournaments alter column id set default nextval('public.tournaments_id_seq');
alter table public.tournaments alter column coeficiente set default 90;

grant usage, select on sequence public.players_id_seq, public.tournaments_id_seq to authenticated;

-- 5. Temporadas ------------------------------------------------------------------
create table if not exists public.seasons (
  year int primary key check (year between 2000 and 2100),
  name text,
  best_n int not null default 4 check (best_n between 1 and 20),
  final_multiplier numeric(3,1) not null default 2 check (final_multiplier > 0),
  created_at timestamptz not null default now()
);
alter table public.seasons enable row level security;
drop policy if exists "lectura publica" on public.seasons;
create policy "lectura publica" on public.seasons for select to anon, authenticated using (true);
drop policy if exists "escritura admin" on public.seasons;
create policy "escritura admin" on public.seasons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.seasons(year)
select distinct extract(year from date)::int from public.tournaments
on conflict do nothing;

-- 6. Handicap actual (privado) ---------------------------------------------------
alter table public.player_private add column if not exists handicap numeric(3,1);

-- 7. Clasificación de temporada ---------------------------------------------------
-- Una fila por jugador con puntos > 0.
--   puesto       : posición final (empate a puntos => gana el handicap más bajo)
--   compartido   : true si comparte puesto (mismos puntos y mismo handicap o sin handicap)
--   por_hcp      : true si estaba empatado a puntos y el handicap ha decidido el orden
--   detalle      : {"<tournament_id>": {"p": puntos del torneo, "c": cuenta para el total}}
-- Handicap de desempate: el de la final de la temporada; si no hay, el último de la temporada;
-- si no hay, el handicap actual del jugador. Los valores no se devuelven (en público solo el nombre).
create or replace function public.season_board(p_season int, p_modality text)
returns table(
  puesto int, compartido boolean, por_hcp boolean,
  player_id int, nombre text, puntos numeric, jugados int, detalle jsonb)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce((select best_n from seasons where year = p_season), 4) as n,
           coalesce((select final_multiplier from seasons where year = p_season), 2) as m
  ),
  t as (
    select r.player_id, r.tournament_id, r.points, tr.is_final, tr.date
    from results r join tournaments tr on tr.id = r.tournament_id
    where r.modality = p_modality and extract(year from tr.date) = p_season
  ),
  ranked as (
    select t.*, row_number() over (partition by t.player_id, t.is_final order by t.points desc, t.date) as rn
    from t
  ),
  marked as (
    select ranked.*, (ranked.is_final or ranked.rn <= cfg.n) as cuenta,
           case when ranked.is_final then ranked.points * cfg.m else ranked.points end as valor
    from ranked cross join cfg
  ),
  agg as (
    select m.player_id,
           sum(case when m.cuenta then m.valor else 0 end) as puntos,
           count(*)::int as jugados,
           jsonb_object_agg(m.tournament_id::text, jsonb_build_object('p', m.points, 'c', m.cuenta)) as detalle
    from marked m group by m.player_id
  ),
  hc as (
    select a.*, coalesce(
      (select h.handicap from handicaps h join tournaments tr on tr.id = h.tournament_id
        where h.player_id = a.player_id and extract(year from tr.date) = p_season
        order by tr.is_final desc, tr.date desc limit 1),
      (select pp.handicap from player_private pp where pp.player_id = a.player_id)
    ) as hcp
    from agg a where a.puntos > 0
  ),
  pos as (
    select hc.*,
      rank() over (order by hc.puntos desc, hc.hcp asc nulls last)::int as puesto,
      count(*) over (partition by hc.puntos) as n_pts,
      count(*) over (partition by hc.puntos, hc.hcp) as n_pts_hcp
    from hc
  )
  select pos.puesto, pos.n_pts_hcp > 1, pos.n_pts > 1 and pos.n_pts_hcp < pos.n_pts,
         pos.player_id, concat_ws(' ', p.nombre, p.apellido1, p.apellido2), pos.puntos, pos.jugados, pos.detalle
  from pos join players p on p.id = pos.player_id
  order by pos.puesto, 5
$$;
grant execute on function public.season_board(int, text) to anon, authenticated;

-- La función antigua pasa a usar la misma lógica (mismo formato de salida que antes).
create or replace function public.annual_standings(p_season int, p_modality text)
returns table(puesto bigint, player_id int, nombre text, puntos int)
language sql stable set search_path = public as $$
  select b.puesto::bigint, b.player_id, b.nombre, b.puntos::int from public.season_board(p_season, p_modality) b
$$;

-- 8. Guardar resultados de un torneo ---------------------------------------------
-- p_rows: [{"player_id": 12, "stableford": 36, "scratch": 20, "hcp": 14.2,
--           "pos_stableford": null, "pos_scratch": null}, ...]
-- Sustituye todos los resultados y handicaps del torneo. Si no se dan puestos, se calculan:
-- más puntos primero y, a igualdad, handicap más bajo; si también empatan, comparten puesto.
-- Convierte el JSON de filas en una tabla tipada.
create or replace function public._parse_result_rows(p_rows jsonb)
returns table(player_id int, sf int, sc int, hcp numeric(3,1), pos_sf int, pos_sc int)
language sql immutable set search_path = public as $$
  select (r->>'player_id')::int,
         nullif(r->>'stableford', '')::int,
         nullif(r->>'scratch', '')::int,
         nullif(r->>'hcp', '')::numeric(3,1),
         nullif(r->>'pos_stableford', '')::int,
         nullif(r->>'pos_scratch', '')::int
  from jsonb_array_elements(p_rows) r
$$;

create or replace function public.save_tournament_results(p_tournament_id int, p_rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_date date;
  v_sf int; v_sc int;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede guardar resultados' using errcode = '42501';
  end if;
  select date into v_date from tournaments where id = p_tournament_id;
  if v_date is null then
    raise exception 'El torneo % no existe', p_tournament_id;
  end if;

  delete from results where tournament_id = p_tournament_id;
  delete from handicaps where tournament_id = p_tournament_id;

  insert into results(tournament_id, player_id, modality, position, points)
  select p_tournament_id, player_id, 'stableford',
         coalesce(pos_sf, rank() over (order by sf desc, hcp asc nulls last)), sf
  from public._parse_result_rows(p_rows) where sf is not null;
  get diagnostics v_sf = row_count;

  insert into results(tournament_id, player_id, modality, position, points)
  select p_tournament_id, player_id, 'scratch',
         coalesce(pos_sc, rank() over (order by sc desc, hcp asc nulls last)), sc
  from public._parse_result_rows(p_rows) where sc is not null;
  get diagnostics v_sc = row_count;

  insert into handicaps(tournament_id, player_id, handicap)
  select p_tournament_id, player_id, hcp from public._parse_result_rows(p_rows) where hcp is not null;

  -- El handicap actual del jugador se actualiza si este es su torneo más reciente con handicap.
  insert into player_private(player_id, handicap)
  select r.player_id, r.hcp from public._parse_result_rows(p_rows) r
  where r.hcp is not null
    and not exists (
      select 1 from handicaps h join tournaments t on t.id = h.tournament_id
      where h.player_id = r.player_id and t.date > v_date)
  on conflict (player_id) do update set handicap = excluded.handicap;

  return jsonb_build_object('stableford', v_sf, 'scratch', v_sc);
end $$;
grant execute on function public.save_tournament_results(int, jsonb) to authenticated;
