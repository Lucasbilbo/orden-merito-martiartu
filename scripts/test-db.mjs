// Prueba las migraciones en un Postgres local (no toca Supabase).
// Uso: DATABASE_URL=postgres://... node scripts/test-db.mjs
// Crea un esquema "auth" mínimo como el de Supabase, aplica 0001, carga los datos demo,
// aplica 0002 y comprueba: season_board() == seasonBoard() en JS, guardado de resultados
// y que solo el admin puede escribir.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { buildDemoData, DEMO_SEASON } from '../src/demo/seed.js'
import { seasonBoard, tournamentResults } from '../src/lib/standings.js'

const DB = process.env.DATABASE_URL || 'postgres://postgres@localhost/om_test'
const psql = (sql, { json = false } = {}) => {
  const out = execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { encoding: 'utf8' })
  return json ? JSON.parse(out.trim() || 'null') : out
}
const file = (path) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path], { encoding: 'utf8' })

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

// --- Esquema mínimo de Supabase ---
psql(`
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade; create schema auth;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`)
file('supabase/migrations/0001_esquema_inicial.sql')

// --- Datos demo ---
const d = buildDemoData()
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const ins = (table, cols, rows) =>
  rows.length ? `insert into ${table}(${cols.join(',')}) values ${rows.map((r) => `(${cols.map((c) => q(r[c])).join(',')})`).join(',')};` : ''
psql(
  [
    ins('public.players', ['id', 'nombre', 'apellido1', 'apellido2'], d.players),
    ins('public.tournaments', ['id', 'name', 'date', 'coeficiente', 'course', 'is_final'], d.tournaments),
    ins('public.results', ['tournament_id', 'player_id', 'modality', 'position', 'points'], d.results),
    ins('public.handicaps', ['tournament_id', 'player_id', 'handicap'], d.handicaps),
    ins('public.params', ['name', 'value', 'valid_from', 'description'], d.params),
  ].join('\n'),
)
file('supabase/migrations/0002_admin_temporadas_resultados.sql')
// Idempotencia: aplicar dos veces no debe fallar
file('supabase/migrations/0002_admin_temporadas_resultados.sql')
check('0002 se puede aplicar dos veces', true)

// --- season_board vs JS ---
const sqlBoard = (mod) =>
  psql(`select coalesce(json_agg(b), '[]') from public.season_board(${DEMO_SEASON}, '${mod}') b`, { json: true })
const norm = (rows) =>
  rows
    .map((r) => `${r.puesto}|${r.compartido}|${r.por_hcp}|${r.player_id}|${Number(r.puntos)}|${r.jugados}|${Object.entries(r.detalle).sort().map(([k, v]) => `${k}:${v.p}:${v.c}`).join(',')}`)
    .sort()
for (const mod of ['stableford', 'scratch']) {
  const js = seasonBoard({ season: DEMO_SEASON, modality: mod, ...d, config: d.seasons[0] })
  const sql = sqlBoard(mod)
  const a = norm(js)
  const b = norm(sql)
  const diff = a.filter((x, i) => x !== b[i])
  check(`season_board ${mod}: SQL y JS coinciden (${sql.length} jugadores)`, a.length === b.length && diff.length === 0, diff.slice(0, 3).join(' / '))
  if (mod === 'stableford') {
    check('hay un empate decidido por handicap en el demo', sql.some((r) => r.por_hcp))
    check('el desempate pone delante al handicap más bajo', (() => {
      const tied = sql.filter((r) => r.por_hcp)
      return tied.length >= 2 && tied[0].puesto < tied[1].puesto
    })())
  }
}
const annual = psql(`select count(*) from public.annual_standings(${DEMO_SEASON}, 'stableford')`).trim()
check('annual_standings sigue funcionando', Number(annual) > 30, `${annual} filas`)

// Reglas configurables: mejores 3 en vez de 4
psql(`update public.seasons set best_n = 3 where year = ${DEMO_SEASON}`)
{
  const js = seasonBoard({ season: DEMO_SEASON, modality: 'stableford', ...d, config: { best_n: 3, final_multiplier: 2 } })
  check('best_n configurable (3) coincide con JS', norm(js).join() === norm(sqlBoard('stableford')).join())
}
psql(`update public.seasons set best_n = 4 where year = ${DEMO_SEASON}`)

// --- Permisos ---
const ADMIN = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const FAKE = '33333333-3333-3333-3333-333333333333'
psql(`insert into auth.users values
  ('${ADMIN}', 'LucasBilbao.lucasbi@gmail.com', now()),
  ('${OTHER}', 'otro@example.com', now()),
  ('${FAKE}', 'lucasbilbao.lucasbi@gmail.com', null)`)
const as = (role, uid, sql) =>
  `begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', true); ${sql}; commit;`
const tries = (role, uid, sql) => {
  try {
    psql(as(role, uid, sql))
    return true
  } catch {
    return false
  }
}
const count = (role, uid, sql) => Number(psql(as(role, uid, sql)).trim().split('\n').filter(Boolean).pop())

check('anon puede leer resultados', count('anon', null, 'select count(*) from public.results') > 0)
check('anon NO puede leer handicaps', count('anon', null, 'select count(*) from public.handicaps') === 0)
check('anon NO puede leer admins', !tries('anon', null, 'select * from public.admins') || count('anon', null, 'select count(*) from public.admins') === 0)
check('anon NO puede insertar torneos', !tries('anon', null, "insert into public.tournaments(name,date) values ('x','2027-01-01')"))
check('usuario normal NO puede insertar torneos', !tries('authenticated', OTHER, "insert into public.tournaments(name,date) values ('x','2027-01-01')"))
check('correo sin confirmar NO es admin', !tries('authenticated', FAKE, "insert into public.tournaments(name,date) values ('x','2027-01-01')"))
check('admin puede crear torneo con id automático', tries('authenticated', ADMIN, "insert into public.tournaments(name,date) values ('OMPrueba','2027-11-07')"))
check('admin puede crear jugador con id automático', tries('authenticated', ADMIN, "insert into public.players(nombre) values ('Nuevo')"))
check('admin puede editar temporada', tries('authenticated', ADMIN, `update public.seasons set name='Demo' where year=${DEMO_SEASON}`))
check('admin puede leer handicaps', count('authenticated', ADMIN, 'select count(*) from public.handicaps') > 0)
check('usuario normal NO puede guardar resultados', !tries('authenticated', OTHER, `select public.save_tournament_results(5, '[]'::jsonb)`))

// --- Guardar resultados de un torneo (torneo 5, aún sin jugar) ---
const rows = [
  { player_id: 1, stableford: 38, scratch: 30, hcp: 6.1 },
  { player_id: 2, stableford: 38, scratch: 20, hcp: 15.4 },
  { player_id: 3, stableford: 35, scratch: 30, hcp: 6.1 },
  { player_id: 4, stableford: 35, scratch: '', hcp: null },
  { player_id: 5, stableford: 40, scratch: 18, hcp: 21.0 },
]
check('admin guarda resultados', tries('authenticated', ADMIN, `select public.save_tournament_results(5, '${JSON.stringify(rows)}'::jsonb)`))
const saved = psql(
  "select json_agg(json_build_object('tournament_id',tournament_id,'player_id',player_id,'modality',modality,'position',position,'points',points)) from public.results where tournament_id=5",
  { json: true },
)
const key = (r) => `${r.modality}|${r.player_id}|${r.position}|${r.points}`
const expected = tournamentResults(5, rows).map(key).sort()
check('puestos calculados igual en SQL y JS', saved.map(key).sort().join() === expected.join(), saved.map(key).sort().join(' '))
check('a igualdad de puntos gana el hcp más bajo', saved.find((r) => r.modality === 'stableford' && r.player_id === 1).position === 2)
check('sin scratch no se crea fila scratch', !saved.some((r) => r.modality === 'scratch' && r.player_id === 4))
const cur = psql('select handicap from public.player_private where player_id = 1').trim()
check('handicap actual se actualiza', cur === '6.1', cur)
// Volver a guardar sustituye (no duplica)
tries('authenticated', ADMIN, `select public.save_tournament_results(5, '${JSON.stringify(rows.slice(0, 2))}'::jsonb)`)
check('guardar de nuevo sustituye los resultados', Number(psql('select count(*) from public.results where tournament_id=5').trim()) === 4)
// Puesto dado a mano
tries('authenticated', ADMIN, `select public.save_tournament_results(5, '${JSON.stringify([{ ...rows[0], pos_stableford: 7 }])}'::jsonb)`)
check('se respeta el puesto dado a mano', psql("select position from public.results where tournament_id=5 and modality='stableford'").trim() === '7')

console.log(failures ? `\n${failures} prueba(s) fallida(s)` : '\nTodas las pruebas OK')
process.exit(failures ? 1 : 0)
