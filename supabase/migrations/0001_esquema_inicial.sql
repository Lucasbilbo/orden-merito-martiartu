-- YA APLICADA el 20/10/2026 en el proyecto fghrxdrtygcpqucgntki (orden-merito-martiartu).
-- Se guarda aquí como referencia: reconstruye el esquema que hay hoy en Supabase.
-- No hace falta volver a ejecutarla.

create table public.players (
  id int primary key,
  nombre text not null,
  apellido1 text,
  apellido2 text,
  created_at timestamptz not null default now()
);

-- Datos de contacto y licencia: nunca públicos
create table public.player_private (
  player_id int primary key references public.players(id) on delete cascade,
  email text,
  telefono text,
  licencia text unique
);

create table public.tournaments (
  id int primary key,
  name text not null unique,
  date date not null,
  coeficiente int not null,
  course text,
  is_final boolean not null default false
);
create index tournaments_date_idx on public.tournaments(date);

create table public.results (
  id bigint generated always as identity primary key,
  tournament_id int not null references public.tournaments(id) on delete cascade,
  player_id int not null references public.players(id),
  modality text not null check (modality in ('stableford','scratch')),
  position int check (position is null or position > 0),
  points int not null,
  unique (tournament_id, player_id, modality)
);
create index results_player_idx on public.results(player_id);
create index results_tournament_idx on public.results(tournament_id);

create table public.params (
  name text not null,
  value int not null,
  valid_from date not null,
  description text,
  primary key (name, valid_from)
);

-- Handicap RFEG de cada jugador en cada torneo (el que aparece en el PDF del club)
create table public.handicaps (
  tournament_id int not null references public.tournaments(id) on delete cascade,
  player_id int not null references public.players(id) on delete cascade,
  handicap numeric(3,1) not null,
  primary key (tournament_id, player_id)
);

alter table public.players enable row level security;
alter table public.player_private enable row level security;
alter table public.tournaments enable row level security;
alter table public.results enable row level security;
alter table public.params enable row level security;
alter table public.handicaps enable row level security;

create policy "lectura publica" on public.players for select to anon, authenticated using (true);
create policy "lectura publica" on public.tournaments for select to anon, authenticated using (true);
create policy "lectura publica" on public.results for select to anon, authenticated using (true);
create policy "lectura publica" on public.params for select to anon, authenticated using (true);
create policy "lectura publica" on public.handicaps for select to anon, authenticated using (true);

-- Clasificación anual: 4 mejores torneos no finales + finales x2; empate => handicap más bajo en la final
create or replace function public.annual_standings(p_season int, p_modality text)
returns table(puesto bigint, player_id int, nombre text, puntos int)
language sql stable set search_path = public as $$
  with t as (
    select r.player_id, r.points, tr.is_final
    from results r join tournaments tr on tr.id = r.tournament_id
    where r.modality = p_modality and extract(year from tr.date) = p_season
  ),
  best as (
    select player_id, points,
           row_number() over (partition by player_id order by points desc) rn
    from t where not is_final
  ),
  agg as (
    select p.id as player_id,
      coalesce((select sum(points) from best b where b.player_id = p.id and b.rn <= 4), 0)
      + 2 * coalesce((select sum(points) from t where t.player_id = p.id and t.is_final), 0) as puntos,
      (select min(h.handicap)
         from handicaps h join tournaments tr on tr.id = h.tournament_id
        where h.player_id = p.id and tr.is_final and extract(year from tr.date) = p_season) as hcp
    from players p
  )
  select rank() over (order by a.puntos desc, a.hcp asc nulls last), a.player_id,
         concat_ws(' ', p.nombre, p.apellido1, p.apellido2), a.puntos::int
  from agg a join players p on p.id = a.player_id
  where a.puntos > 0
  order by 1, 3
$$;

-- Ranking histórico con caída por antigüedad (réplica del sistema PHP)
create or replace function public.ranking(p_modality text, p_as_of date default current_date)
returns table(puesto bigint, player_id int, nombre text, puntos numeric)
language sql stable set search_path = public as $$
  with prm as (
    select
      (select value from params where name = 'semanas_exentas' order by (valid_from <= p_as_of) desc, valid_from desc limit 1) as e,
      (select value from params where name = 'semanas_reducciones' order by (valid_from <= p_as_of) desc, valid_from desc limit 1) as r,
      (select value from params where name = 'Puestos_Puntuables' order by (valid_from <= p_as_of) desc, valid_from desc limit 1) as p,
      date_trunc('week', p_as_of - 1)::date as lunes
  ),
  calc as (
    select r.player_id,
      case when r.position > prm.p then 0
      else
        (case when r.position = 1 then tr.coeficiente
              else tr.coeficiente * (1 - r.position::numeric / prm.p) end)
        * (case when greatest(0, (prm.lunes - tr.date) / 7) <= prm.e then 1
                else 1 - greatest(0, (prm.lunes - tr.date) / 7)::numeric / (prm.e + prm.r) end)
      end as pts
    from results r
    join tournaments tr on tr.id = r.tournament_id
    cross join prm
    where r.modality = p_modality
      and tr.date > prm.lunes - (prm.e + prm.r) * 7
      and tr.date <= p_as_of
  ),
  tot as (select player_id, sum(pts) as puntos from calc group by player_id)
  select rank() over (order by t.puntos desc), t.player_id,
         concat_ws(' ', p.nombre, p.apellido1, p.apellido2), round(t.puntos, 3)
  from tot t join players p on p.id = t.player_id
  where t.puntos > 0
  order by 1, 3
$$;
