// Modo demo: misma interfaz que real.js pero con datos inventados guardados en este navegador.
import { buildDemoData } from '../demo/seed.js'
import { seasonBoard, tournamentResults } from '../lib/standings.js'
import { mergeEntries } from './real.js'

const STORE = 'om-demo-data-v1'
let _db = null
const D = () => (_db ??= load())

function load() {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw)
  } catch {
    /* sin almacenamiento: datos en memoria */
  }
  return buildDemoData()
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(D()))
  } catch {
    /* ignorar */
  }
}
export function resetDemo() {
  _db = buildDemoData()
  save()
}

const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120))
const nextId = (list) => Math.max(0, ...list.map((x) => x.id)) + 1

export const getTournaments = () =>
  wait(
    [...D().tournaments]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => ({ ...t, n_results: D().results.filter((r) => r.tournament_id === t.id).length })),
  )
export const getSeasons = () => wait(D().seasons)
export const getParams = () => wait(D().params)
export const getPlayers = () => wait(D().players)

export const getSeasonBoard = (season, modality) =>
  wait(seasonBoard({ season, modality, ...D(), config: D().seasons.find((s) => s.year === season) }))

export function getRanking(modality) {
  // Misma fórmula que ranking() en SQL, calculada al día siguiente del último torneo jugado.
  const p = (n) => D().params.filter((x) => x.name === n).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]?.value
  const [e, red, puestos] = [p('semanas_exentas'), p('semanas_reducciones'), p('Puestos_Puntuables')]
  const played = D().tournaments.filter((t) => D().results.some((r) => r.tournament_id === t.id))
  const last = played.map((t) => t.date).sort().pop()
  if (!last) return wait([])
  const asOf = new Date(`${last}T00:00:00Z`)
  asOf.setUTCDate(asOf.getUTCDate() + 1)
  const monday = new Date(asOf)
  monday.setUTCDate(monday.getUTCDate() - 1)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const tot = {}
  for (const r of D().results.filter((x) => x.modality === modality)) {
    const t = D().tournaments.find((x) => x.id === r.tournament_id)
    const weeks = Math.max(0, Math.floor((monday - new Date(`${t.date}T00:00:00Z`)) / (7 * 864e5)))
    if (weeks >= e + red || r.position == null || r.position > puestos) continue
    const base = r.position === 1 ? t.coeficiente : t.coeficiente * (1 - r.position / puestos)
    const decay = weeks <= e ? 1 : 1 - weeks / (e + red)
    tot[r.player_id] = (tot[r.player_id] || 0) + base * decay
  }
  const rows = Object.entries(tot)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => {
      const pl = D().players.find((x) => x.id === Number(id))
      return { player_id: Number(id), nombre: [pl.nombre, pl.apellido1, pl.apellido2].filter(Boolean).join(' '), puntos: Math.round(v * 1000) / 1000 }
    })
  return wait(
    rows
      .map((r) => ({ ...r, puesto: 1 + rows.filter((o) => o.puntos > r.puntos).length }))
      .sort((a, b) => a.puesto - b.puesto || a.nombre.localeCompare(b.nombre, 'es')),
  )
}

export const getTournamentResults = (tid) =>
  wait(
    D().results
      .filter((r) => r.tournament_id === tid)
      .map((r) => ({ ...r, players: D().players.find((p) => p.id === r.player_id) }))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || b.points - a.points),
  )

// Sesión: en demo siempre se entra como admin, sin contraseña.
export const getSession = () => Promise.resolve({ user: { email: 'demo@martiartu' } })
export const onAuthChange = () => () => {}
export const signIn = () => Promise.resolve()
export const signOut = () => Promise.resolve()
export const isAdmin = () => Promise.resolve(true)

export const adminGetPlayers = () => wait(D().players.map((p) => ({ ...p, handicap: D().currentHcp[p.id] ?? null })))

export function createPlayer({ nombre, apellido1, apellido2, handicap }) {
  const id = nextId(D().players)
  D().players.push({ id, nombre, apellido1: apellido1 || null, apellido2: apellido2 || null })
  if (handicap !== '' && handicap != null) D().currentHcp[id] = Number(handicap)
  save()
  return wait(id)
}
export function updatePlayer(id, { nombre, apellido1, apellido2, handicap }) {
  Object.assign(D().players.find((p) => p.id === id), { nombre, apellido1: apellido1 || null, apellido2: apellido2 || null })
  D().currentHcp[id] = handicap === '' || handicap == null ? null : Number(handicap)
  save()
  return wait(null)
}
export function upsertSeason(s) {
  const i = D().seasons.findIndex((x) => x.year === s.year)
  if (i >= 0) D().seasons[i] = { ...D().seasons[i], ...s }
  else D().seasons.push({ name: null, best_n: 4, final_multiplier: 2, ...s })
  save()
  return wait(null)
}
export function createTournament(t) {
  if (D().tournaments.some((x) => x.name === t.name)) return Promise.reject(new Error('Ya existe un torneo con ese nombre.'))
  const id = nextId(D().tournaments)
  D().tournaments.push({ coeficiente: 90, is_final: false, course: null, ...t, id })
  save()
  return wait(id)
}
export function updateTournament(id, t) {
  Object.assign(D().tournaments.find((x) => x.id === id), t)
  save()
  return wait(null)
}
export function deleteTournament(id) {
  D().tournaments = D().tournaments.filter((t) => t.id !== id)
  D().results = D().results.filter((r) => r.tournament_id !== id)
  D().handicaps = D().handicaps.filter((h) => h.tournament_id !== id)
  save()
  return wait(null)
}
export const getTournamentEntries = (tid) =>
  wait(
    mergeEntries(
      D().results.filter((r) => r.tournament_id === tid),
      D().handicaps.filter((h) => h.tournament_id === tid),
    ),
  )
export function saveTournamentResults(tid, rows) {
  const results = tournamentResults(tid, rows)
  D().results = D().results.filter((r) => r.tournament_id !== tid).concat(results)
  D().handicaps = D().handicaps
    .filter((h) => h.tournament_id !== tid)
    .concat(rows.filter((r) => r.hcp !== '' && r.hcp != null).map((r) => ({ tournament_id: tid, player_id: r.player_id, handicap: Number(r.hcp) })))
  const date = D().tournaments.find((t) => t.id === tid).date
  for (const r of rows) {
    if (r.hcp === '' || r.hcp == null) continue
    const later = D().handicaps.some(
      (h) => h.player_id === r.player_id && D().tournaments.find((t) => t.id === h.tournament_id)?.date > date,
    )
    if (!later) D().currentHcp[r.player_id] = Number(r.hcp)
  }
  save()
  return wait({
    stableford: results.filter((r) => r.modality === 'stableford').length,
    scratch: results.filter((r) => r.modality === 'scratch').length,
  })
}
export function setParam(name, value, description) {
  const today = new Date().toISOString().slice(0, 10)
  D().params = D().params.filter((p) => !(p.name === name && p.valid_from === today))
  D().params.push({ name, value: Number(value), valid_from: today, description })
  save()
  return wait(null)
}
