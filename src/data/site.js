// Datos comunes (torneos, temporadas, parámetros) con caché en memoria.
import { useEffect, useState } from 'react'
import api from './api.js'
import { seasonOf } from '../lib/format.js'

let cache = null
const subs = new Set()

function load() {
  cache = Promise.all([api.getTournaments(), api.getSeasons(), api.getParams()]).then(([tournaments, seasonRows, params]) => {
    const years = new Set([...tournaments.map(seasonOf), ...seasonRows.map((s) => s.year)])
    const seasons = [...years].sort((a, b) => b - a)
    const played = tournaments.filter((t) => t.n_results > 0).map(seasonOf)
    const currentSeason = played.length ? Math.max(...played) : seasons[0] ?? new Date().getFullYear()
    const config = (year) => {
      const s = seasonRows.find((x) => x.year === year)
      return { best_n: s?.best_n ?? 4, final_multiplier: Number(s?.final_multiplier ?? 2), name: s?.name ?? null }
    }
    return { tournaments, seasonRows, params, seasons, currentSeason, config }
  })
  cache.catch(() => (cache = null))
  return cache
}

export function invalidateSite() {
  cache = null
  subs.forEach((f) => f())
}

export function useSite() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [v, setV] = useState(0)
  useEffect(() => {
    const f = () => setV((x) => x + 1)
    subs.add(f)
    return () => subs.delete(f)
  }, [])
  useEffect(() => {
    let alive = true
    ;(cache || load())
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }))
    return () => {
      alive = false
    }
  }, [v])
  return state
}
