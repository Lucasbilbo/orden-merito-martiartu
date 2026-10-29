// Acceso a Supabase (datos reales).
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

const unwrap = ({ data, error }) => {
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details })
  return data
}
// Función o tabla aún no creada (migración 0002 sin aplicar).
const missing = (e) => ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e?.code) || /does not exist|Could not find/i.test(e?.message || '')

// ---------- Lectura pública ----------
export async function getTournaments() {
  const rows = unwrap(
    await supabase
      .from('tournaments')
      .select('*,results(count)')
      .order('date', { ascending: true }),
  )
  return rows.map(({ results, ...t }) => ({ ...t, n_results: results?.[0]?.count ?? 0 }))
}

export async function getSeasons() {
  try {
    return unwrap(await supabase.from('seasons').select('year,name,best_n,final_multiplier').order('year'))
  } catch (e) {
    if (missing(e)) return []
    throw e
  }
}

export async function getParams() {
  return unwrap(await supabase.from('params').select('name,value,valid_from,description').order('valid_from', { ascending: false }))
}

export async function getSeasonBoard(season, modality) {
  try {
    return unwrap(await supabase.rpc('season_board', { p_season: season, p_modality: modality }))
  } catch (e) {
    if (!missing(e)) throw e
    // Sin la migración 0002: clasificación antigua, sin desglose por torneo.
    const rows = unwrap(await supabase.rpc('annual_standings', { p_season: season, p_modality: modality }))
    return rows.map((r) => ({ ...r, compartido: rows.filter((o) => o.puesto === r.puesto).length > 1, por_hcp: false, detalle: null }))
  }
}

export async function getRanking(modality) {
  return unwrap(await supabase.rpc('ranking', { p_modality: modality }))
}

export async function getTournamentResults(tournamentId) {
  return unwrap(
    await supabase
      .from('results')
      .select('modality,position,points,player_id,players(nombre,apellido1,apellido2)')
      .eq('tournament_id', tournamentId)
      .order('position', { ascending: true, nullsFirst: false })
      .order('points', { ascending: false }),
  )
}

export async function getPlayers() {
  return unwrap(await supabase.from('players').select('id,nombre,apellido1,apellido2').order('apellido1').order('nombre'))
}

// ---------- Sesión ----------
export async function getSession() {
  return unwrap(await supabase.auth.getSession()).session
}
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session))
  return () => data.subscription.unsubscribe()
}
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
}
export async function signOut() {
  await supabase.auth.signOut()
}
export async function isAdmin() {
  try {
    return Boolean(unwrap(await supabase.rpc('is_admin')))
  } catch (e) {
    if (missing(e)) throw new Error('Falta aplicar la migración 0002 en Supabase (ver README).')
    throw e
  }
}

// ---------- Admin ----------
export async function adminGetPlayers() {
  const players = await getPlayers()
  const priv = unwrap(await supabase.from('player_private').select('player_id,handicap'))
  const h = Object.fromEntries(priv.map((p) => [p.player_id, p.handicap]))
  return players.map((p) => ({ ...p, handicap: h[p.id] ?? null }))
}

export async function createPlayer({ nombre, apellido1, apellido2, handicap }) {
  const row = unwrap(
    await supabase
      .from('players')
      .insert({ nombre, apellido1: apellido1 || null, apellido2: apellido2 || null })
      .select('id')
      .single(),
  )
  if (handicap !== null && handicap !== undefined && handicap !== '') {
    unwrap(await supabase.from('player_private').upsert({ player_id: row.id, handicap: Number(handicap) }))
  }
  return row.id
}

export async function updatePlayer(id, { nombre, apellido1, apellido2, handicap }) {
  unwrap(await supabase.from('players').update({ nombre, apellido1: apellido1 || null, apellido2: apellido2 || null }).eq('id', id))
  unwrap(
    await supabase
      .from('player_private')
      .upsert({ player_id: id, handicap: handicap === '' || handicap == null ? null : Number(handicap) }),
  )
}

export async function upsertSeason(season) {
  unwrap(await supabase.from('seasons').upsert(season))
}

export async function createTournament(t) {
  return unwrap(await supabase.from('tournaments').insert(t).select('id').single()).id
}
export async function updateTournament(id, t) {
  unwrap(await supabase.from('tournaments').update(t).eq('id', id))
}
export async function deleteTournament(id) {
  unwrap(await supabase.from('tournaments').delete().eq('id', id))
}

// Filas del editor: una por jugador con sus puntos, puestos y handicap.
export async function getTournamentEntries(tournamentId) {
  const res = unwrap(await supabase.from('results').select('player_id,modality,position,points').eq('tournament_id', tournamentId))
  const hc = unwrap(await supabase.from('handicaps').select('player_id,handicap').eq('tournament_id', tournamentId))
  return mergeEntries(res, hc)
}

export function mergeEntries(results, handicaps) {
  const by = new Map()
  const get = (id) => {
    if (!by.has(id)) by.set(id, { player_id: id, stableford: '', scratch: '', hcp: '', pos_stableford: '', pos_scratch: '' })
    return by.get(id)
  }
  for (const r of results) {
    const e = get(r.player_id)
    e[r.modality] = r.points
    e[`pos_${r.modality}`] = r.position ?? ''
  }
  for (const h of handicaps) get(h.player_id).hcp = h.handicap
  return [...by.values()]
}

export async function saveTournamentResults(tournamentId, rows) {
  return unwrap(await supabase.rpc('save_tournament_results', { p_tournament_id: tournamentId, p_rows: rows }))
}

export async function setParam(name, value, description) {
  const today = new Date().toISOString().slice(0, 10)
  unwrap(await supabase.from('params').upsert({ name, value: Number(value), valid_from: today, description }))
}

// ---------- Inscripciones ----------
const rpcError = (e) => {
  // Los mensajes de las funciones signup_* ya vienen en castellano para el jugador.
  throw new Error(e.message || 'No se ha podido completar la inscripción.')
}

export async function getSignupStatus(tournamentId) {
  try {
    const rows = unwrap(await supabase.rpc('signup_status', { p_tournament_id: tournamentId }))
    return rows?.[0] || null
  } catch (e) {
    if (missing(e)) return null
    throw e
  }
}

export async function getSignupList(tournamentId) {
  try {
    return unwrap(await supabase.rpc('signup_list', { p_tournament_id: tournamentId }))
  } catch (e) {
    if (missing(e)) return []
    throw e
  }
}

export async function createSignup({ tournament_id, player_id, nombre, email, phone, hcp, comment }) {
  const { data, error } = await supabase.rpc('signup_create', {
    p_tournament_id: tournament_id,
    p_player_id: player_id || null,
    p_nombre: nombre || null,
    p_email: email || null,
    p_phone: phone || null,
    p_hcp: hcp === '' || hcp == null ? null : Number(String(hcp).replace(',', '.')),
    p_comment: comment || null,
  })
  if (error) rpcError(error)
  return data
}

export async function lookupSignup(token) {
  const { data, error } = await supabase.rpc('signup_lookup', { p_token: token })
  if (error) {
    if (/uuid/i.test(error.message)) return null
    throw new Error(error.message)
  }
  return data?.[0] || null
}

export async function cancelSignup(token) {
  const { data, error } = await supabase.rpc('signup_cancel', { p_token: token })
  if (error) rpcError(error)
  return data
}

// Admin
export async function adminGetSignups(tournamentId) {
  return unwrap(
    await supabase
      .from('signups')
      .select('id,tournament_id,player_id,nombre,email,phone,hcp,comment,status,tee_time,cancel_token,created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at'),
  )
}
export async function adminAddSignup(row) {
  return unwrap(await supabase.from('signups').insert(row).select('id').single()).id
}
export async function adminUpdateSignup(id, patch) {
  unwrap(await supabase.from('signups').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
}
export async function adminSetTeeTimes(pairs) {
  for (const [id, tee_time] of pairs) {
    unwrap(await supabase.from('signups').update({ tee_time: tee_time || null }).eq('id', id))
  }
}
