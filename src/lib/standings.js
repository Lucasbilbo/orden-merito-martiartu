// Cálculo de clasificaciones en JavaScript.
// Es la misma lógica que las funciones SQL season_board() y save_tournament_results()
// (supabase/migrations/0002_...). Se usa en el modo demo y en las pruebas que comparan
// ambos resultados. Si cambias una regla aquí, cámbiala también en la SQL.

export const DEFAULT_CONFIG = { best_n: 4, final_multiplier: 2 }

const yearOf = (iso) => Number(String(iso).slice(0, 4))

// ¿a va estrictamente por delante de b? Más puntos; a igualdad, handicap más bajo (sin handicap, detrás).
function ahead(a, b, ptsKey) {
  if (a[ptsKey] !== b[ptsKey]) return a[ptsKey] > b[ptsKey]
  if (a.hcp == null) return false
  if (b.hcp == null) return true
  return Number(a.hcp) < Number(b.hcp)
}

function sameSpot(a, b, ptsKey) {
  if (a[ptsKey] !== b[ptsKey]) return false
  if (a.hcp == null || b.hcp == null) return a.hcp == null && b.hcp == null
  return Number(a.hcp) === Number(b.hcp)
}

// Equivale a rank() over (order by pts desc, hcp asc nulls last): los empatados comparten puesto.
export function rankByPoints(rows, ptsKey = 'points') {
  return rows.map((r) => ({ ...r, position: 1 + rows.filter((o) => ahead(o, r, ptsKey)).length }))
}

// Puestos de un torneo a partir de lo que mete el admin.
// rows: [{ player_id, stableford, scratch, hcp, pos_stableford, pos_scratch }]
// Devuelve las filas de resultados por modalidad, igual que save_tournament_results().
export function tournamentResults(tournamentId, rows) {
  const out = []
  for (const [modality, key, posKey] of [
    ['stableford', 'stableford', 'pos_stableford'],
    ['scratch', 'scratch', 'pos_scratch'],
  ]) {
    const withPts = rows
      .filter((r) => r[key] !== null && r[key] !== undefined && r[key] !== '')
      .map((r) => ({ ...r, pts: Number(r[key]), hcp: r.hcp === '' || r.hcp == null ? null : Number(r.hcp) }))
    for (const r of rankByPoints(withPts, 'pts')) {
      const given = r[posKey] === '' || r[posKey] == null ? null : Number(r[posKey])
      out.push({
        tournament_id: tournamentId,
        player_id: r.player_id,
        modality,
        position: given ?? r.position,
        points: r.pts,
      })
    }
  }
  return out
}

const fullName = (p) => [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ')

// Clasificación de una temporada. Mismo formato de salida que season_board():
// [{ puesto, compartido, por_hcp, player_id, nombre, puntos, jugados, detalle: { [tid]: { p, c } } }]
export function seasonBoard({ season, modality, players, tournaments, results, handicaps, currentHcp, config }) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) }
  const tById = new Map(tournaments.map((t) => [t.id, t]))
  const inSeason = results.filter((r) => {
    const t = tById.get(r.tournament_id)
    return r.modality === modality && t && yearOf(t.date) === season
  })

  const byPlayer = new Map()
  for (const r of inSeason) {
    const t = tById.get(r.tournament_id)
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
    byPlayer.get(r.player_id).push({ ...r, is_final: t.is_final, date: t.date })
  }

  const rows = []
  for (const [playerId, list] of byPlayer) {
    const detalle = {}
    let puntos = 0
    const normal = list.filter((x) => !x.is_final).sort((a, b) => b.points - a.points || a.date.localeCompare(b.date))
    normal.forEach((x, i) => {
      const cuenta = i < cfg.best_n
      detalle[x.tournament_id] = { p: x.points, c: cuenta }
      if (cuenta) puntos += x.points
    })
    list
      .filter((x) => x.is_final)
      .forEach((x) => {
        detalle[x.tournament_id] = { p: x.points, c: true }
        puntos += x.points * cfg.final_multiplier
      })
    if (puntos <= 0) continue

    const seasonHcps = handicaps
      .filter((h) => h.player_id === playerId)
      .map((h) => ({ ...h, t: tById.get(h.tournament_id) }))
      .filter((h) => h.t && yearOf(h.t.date) === season)
      .sort((a, b) => Number(b.t.is_final) - Number(a.t.is_final) || b.t.date.localeCompare(a.t.date))
    const hcp = seasonHcps.length ? Number(seasonHcps[0].handicap) : currentHcp?.[playerId] ?? null

    const p = players.find((x) => x.id === playerId)
    rows.push({ player_id: playerId, nombre: p ? fullName(p) : '?', puntos, jugados: list.length, detalle, hcp })
  }

  return rows
    .map((r) => {
      const tiedPts = rows.filter((o) => o.puntos === r.puntos).length
      const tiedFull = rows.filter((o) => sameSpot(o, r, 'puntos')).length
      return {
        puesto: 1 + rows.filter((o) => ahead(o, r, 'puntos')).length,
        compartido: tiedFull > 1,
        por_hcp: tiedPts > 1 && tiedFull < tiedPts,
        player_id: r.player_id,
        nombre: r.nombre,
        puntos: r.puntos,
        jugados: r.jugados,
        detalle: r.detalle,
      }
    })
    .sort((a, b) => a.puesto - b.puesto || a.nombre.localeCompare(b.nombre, 'es'))
}
