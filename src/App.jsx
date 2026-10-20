import { useEffect, useMemo, useState } from 'react'
import { getAnnual, getParams, getRanking, getResults, getTournaments } from './api.js'

const MODALITIES = [
  { id: 'stableford', label: 'Stableford' },
  { id: 'scratch', label: 'Scratch' },
]
const TABS = [
  { id: 'clasificacion', label: 'Clasificación' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'torneos', label: 'Torneos' },
]

const fullName = (p) => [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ')
const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
const formatPoints = (n, decimals) =>
  Number(n).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function Flag() {
  return (
    <svg className="flag" viewBox="0 0 16 20" width="14" height="18" aria-hidden="true">
      <path d="M3 1v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M3.8 2.2 14 5.6 3.8 9.4Z" fill="currentColor" />
    </svg>
  )
}

function Board({ rows, decimals = 0, query, pointsLabel = 'Puntos' }) {
  const shared = useMemo(() => {
    const count = {}
    rows.forEach((r) => (count[r.puesto] = (count[r.puesto] || 0) + 1))
    return count
  }, [rows])
  const q = normalize(query.trim())
  const visible = q ? rows.filter((r) => normalize(r.nombre).includes(q)) : rows

  if (!rows.length) return <p className="empty">Todavía no hay resultados en esta modalidad.</p>
  if (!visible.length) return <p className="empty">Ningún jugador coincide con «{query.trim()}».</p>

  return (
    <table className="board">
      <thead>
        <tr>
          <th scope="col" className="c-pos">Puesto</th>
          <th scope="col">Jugador</th>
          <th scope="col" className="c-pts">{pointsLabel}</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((r) => (
          <tr key={r.player_id ?? `${r.puesto}-${r.nombre}`} className={r.puesto === 1 ? 'leader' : undefined}>
            <td className="c-pos">{shared[r.puesto] > 1 ? `T${r.puesto}` : r.puesto}</td>
            <td className="c-name">
              {r.puesto === 1 && <Flag />}
              {r.nombre}
            </td>
            <td className="c-pts">{formatPoints(r.puntos, decimals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Status({ state, children }) {
  if (state.loading) return <p className="status" role="status">Cargando…</p>
  if (state.error)
    return <p className="status error" role="alert">No se han podido cargar los datos. Recarga la página para intentarlo de nuevo.</p>
  return children
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SeasonSelect({ seasons, value, onChange }) {
  return (
    <label className="season">
      <span>Temporada</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  )
}

function Annual({ season, modality, query, tournaments }) {
  const state = useAsync(() => getAnnual(season, modality), [season, modality])
  const played = tournaments.filter((t) => t.date.startsWith(String(season))).length
  return (
    <Status state={state}>
      <p className="note">
        {played} torneos en {season}. Cuentan los 4 mejores resultados más la final, que puntúa doble.
      </p>
      {state.data && <Board rows={state.data} query={query} />}
    </Status>
  )
}

function Ranking({ modality, query }) {
  const state = useAsync(() => getRanking(modality), [modality])
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Status state={state}>
      <p className="note">Calculado a {today}. Cada torneo pierde valor con el paso de las semanas.</p>
      {state.data && <Board rows={state.data} decimals={1} query={query} />}
    </Status>
  )
}

function Tournament({ t, modality }) {
  const [open, setOpen] = useState(false)
  const state = useAsync(() => (open ? getResults(t.id, modality) : Promise.resolve(null)), [open, t.id, modality])
  const rows = (state.data || []).map((r, i) => ({
    puesto: r.position ?? '–',
    nombre: r.players ? fullName(r.players) : 'Jugador sin identificar',
    puntos: r.points,
    player_id: `${i}`,
  }))
  return (
    <li className="tournament">
      <button type="button" className="t-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="t-date">{formatDate(t.date)}</span>
        <span className="t-course">{t.course || t.name}</span>
        {t.is_final && <span className="badge">Final, puntúa doble</span>}
        <span className="chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="t-body">
          <Status state={state}>
            {rows.length ? (
              <table className="board compact">
                <thead>
                  <tr>
                    <th scope="col" className="c-pos">Puesto</th>
                    <th scope="col">Jugador</th>
                    <th scope="col" className="c-pts">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.player_id}>
                      <td className="c-pos">{r.puesto}</td>
                      <td className="c-name">{r.nombre}</td>
                      <td className="c-pts">{r.puntos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No hay resultados de {modality === 'scratch' ? 'Scratch' : 'Stableford'} en este torneo.</p>
            )}
          </Status>
        </div>
      )}
    </li>
  )
}

function Tournaments({ season, modality, tournaments }) {
  const list = tournaments.filter((t) => t.date.startsWith(String(season)))
  return (
    <ul className="tournaments">
      {list.map((t) => (
        <Tournament key={`${t.id}-${modality}`} t={t} modality={modality} />
      ))}
    </ul>
  )
}

function Rules({ params }) {
  const p = Object.fromEntries((params || []).map((x) => [x.name, x.value]))
  const e = p.semanas_exentas
  const total = (p.semanas_exentas ?? 0) + (p.semanas_reducciones ?? 0)
  const last = p.Puestos_Puntuables ? p.Puestos_Puntuables - 1 : null
  return (
    <details className="rules">
      <summary>Cómo se puntúa</summary>
      <div>
        <p>
          <strong>Clasificación anual.</strong> Suma los 4 mejores resultados de la temporada más los puntos de la final
          multiplicados por 2. Los puntos de cada torneo son los que da el campo.
        </p>
        <p>
          <strong>Ranking histórico.</strong> Cada resultado vale según el puesto y el coeficiente del torneo
          (90 los normales, 100 la final).
          {last && <> Puntúan los {last} primeros puestos.</>}
          {e && (
            <>
              {' '}Durante {e} semanas el torneo cuenta entero; después va perdiendo valor hasta desaparecer a las {total}{' '}
              semanas.
            </>
          )}
        </p>
      </div>
    </details>
  )
}

export default function App() {
  const [tab, setTab] = useState('clasificacion')
  const [modality, setModality] = useState('stableford')
  const [season, setSeason] = useState(null)
  const [query, setQuery] = useState('')
  const tournamentsState = useAsync(getTournaments, [])
  const paramsState = useAsync(getParams, [])
  const tournaments = tournamentsState.data || []
  const seasons = useMemo(
    () => [...new Set(tournaments.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a),
    [tournaments],
  )
  useEffect(() => {
    if (season === null && seasons.length) setSeason(seasons[0])
  }, [seasons, season])

  const showSeason = tab !== 'ranking'
  const showSearch = tab !== 'torneos'

  return (
    <>
      <header className="top">
        <div className="wrap top-in">
          <a className="brand" href="https://clubmartiartu.com/golf/" rel="noopener">
            Club Deportivo <span>Martiartu</span>
          </a>
        </div>
      </header>
      <main className="wrap">
        <h1>Orden de Mérito</h1>
        <p className="lead">Clasificaciones y resultados de todos los torneos desde 2021.</p>

        <div className="tabs" role="tablist" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="panel"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <section id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <div className="controls">
            <Segmented value={modality} onChange={setModality} options={MODALITIES} label="Modalidad" />
            {showSeason && season && <SeasonSelect seasons={seasons} value={season} onChange={setSeason} />}
          </div>
          {showSearch && (
            <input
              className="search"
              type="search"
              placeholder="Buscar jugador"
              aria-label="Buscar jugador"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          <Status state={tournamentsState}>
            {season && tab === 'clasificacion' && (
              <Annual season={season} modality={modality} query={query} tournaments={tournaments} />
            )}
            {tab === 'ranking' && <Ranking modality={modality} query={query} />}
            {season && tab === 'torneos' && <Tournaments season={season} modality={modality} tournaments={tournaments} />}
          </Status>
        </section>

        <Rules params={paramsState.data} />
      </main>
      <footer className="wrap foot">
        <p>Orden de Mérito del Club Deportivo Martiartu.</p>
      </footer>
    </>
  )
}
