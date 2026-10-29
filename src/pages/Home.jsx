import { useEffect, useMemo, useState } from 'react'
import api from '../data/api.js'
import { useSite } from '../data/site.js'
import { Link, navigate } from '../router.jsx'
import { formatDate, formatPoints, MODALITIES, normalize, posLabel } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'
import SeasonBoard, { useSeasonTournaments } from '../components/SeasonBoard.jsx'
import { signupState } from '../lib/signups.js'
import { formatWhen } from '../components/Signup.jsx'
import { Flag, SeasonSelect, Segmented, Status } from '../components/ui.jsx'

const TABS = [
  { id: 'clasificacion', label: 'Clasificación', path: '/' },
  { id: 'ranking', label: 'Ranking', path: '/ranking' },
  { id: 'torneos', label: 'Torneos', path: '/torneos' },
]

// Temporada y modalidad viven en la URL (?temporada=2026&modalidad=scratch) para poder compartir enlaces.
export function useQueryState() {
  const read = () => {
    const p = new URLSearchParams(window.location.search)
    return { temporada: Number(p.get('temporada')) || null, modalidad: p.get('modalidad') === 'scratch' ? 'scratch' : 'stableford' }
  }
  const [q, setQ] = useState(read)
  useEffect(() => {
    const f = () => setQ(read())
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [])
  const update = (patch) => {
    const next = { ...q, ...patch }
    setQ(next)
    const p = new URLSearchParams(window.location.search)
    if (next.temporada) p.set('temporada', next.temporada)
    if (next.modalidad === 'scratch') p.set('modalidad', 'scratch')
    else p.delete('modalidad')
    window.history.replaceState({}, '', `${window.location.pathname}?${p}`)
  }
  return [q, update]
}

export const qs = (q) => {
  const p = new URLSearchParams()
  if (q.temporada) p.set('temporada', q.temporada)
  if (q.modalidad === 'scratch') p.set('modalidad', 'scratch')
  const s = p.toString()
  return s ? `?${s}` : ''
}

function SimpleBoard({ rows, decimals = 0, query }) {
  const q = normalize(query)
  const visible = q ? rows.filter((r) => normalize(r.nombre).includes(q)) : rows
  const shared = {}
  rows.forEach((r) => (shared[r.puesto] = (shared[r.puesto] || 0) + 1))
  if (!rows.length) return <p className="empty">Todavía no hay resultados en esta modalidad.</p>
  if (!visible.length) return <p className="empty">Ningún jugador coincide con «{query.trim()}».</p>
  return (
    <table className="board">
      <thead>
        <tr>
          <th scope="col" className="c-pos">Puesto</th>
          <th scope="col">Jugador</th>
          <th scope="col" className="c-pts">Puntos</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((r) => (
          <tr key={r.player_id} className={r.puesto === 1 ? 'leader' : undefined}>
            <td className="c-pos">{posLabel(r.puesto, shared[r.puesto] > 1)}</td>
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

function Annual({ season, modality, query, site }) {
  const tournaments = useSeasonTournaments(site, season)
  const state = useAsync(() => api.getSeasonBoard(season, modality), [season, modality])
  const config = site.config(season)
  const played = tournaments.filter((t) => t.n_results > 0).length
  return (
    <>
      <p className="note">
        {played} de {tournaments.length} torneos jugados en {season}.
      </p>
      <Status state={state}>
        {state.data && <SeasonBoard rows={state.data} tournaments={tournaments} config={config} query={query} />}
      </Status>
    </>
  )
}

function Ranking({ modality, query }) {
  const state = useAsync(() => api.getRanking(modality), [modality])
  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Status state={state}>
      <p className="note">Calculado a {today}. Cada torneo pierde valor con el paso de las semanas.</p>
      {state.data && <SimpleBoard rows={state.data} decimals={1} query={query} />}
    </Status>
  )
}

function Tournaments({ site, season, q }) {
  const list = useSeasonTournaments(site, season)
  if (!list.length) return <p className="empty">No hay torneos en {season}.</p>
  return (
    <ul className="tournaments">
      {list.map((t) => (
        <li key={t.id} className="tournament">
          <Link className="t-head" to={`/torneo/${t.id}${qs(q)}`}>
            <span className="t-date">{formatDate(t.date)}</span>
            <span className="t-course">{t.course || t.name}</span>
            <span className="t-meta">
              {t.is_final && <span className="badge">Final, puntúa ×{formatPoints(site.config(season).final_multiplier)}</span>}
              {t.n_results > 0 ? (
                <span>Resultados publicados</span>
              ) : signupState(t) === 'abierta' ? (
                <span className="open-tag">Inscripción abierta</span>
              ) : (
                <span className="pending">Por jugar</span>
              )}
            </span>
            <span className="chev" aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Rules({ site, season }) {
  const p = Object.fromEntries(
    [...(site.params || [])].sort((a, b) => a.valid_from.localeCompare(b.valid_from)).map((x) => [x.name, x.value]),
  )
  const cfg = site.config(season)
  const e = p.semanas_exentas
  const total = (p.semanas_exentas ?? 0) + (p.semanas_reducciones ?? 0)
  const last = p.Puestos_Puntuables ? p.Puestos_Puntuables - 1 : null
  return (
    <details className="rules">
      <summary>Cómo se puntúa</summary>
      <div>
        <p>
          <strong>Clasificación de la temporada.</strong> Suma los {cfg.best_n} mejores resultados de la temporada más los
          puntos de la final multiplicados por {formatPoints(cfg.final_multiplier)}. Los puntos de cada torneo son los
          Stableford (o Scratch) que da el campo. El ganador de la Orden de Mérito es el primero de Stableford.
        </p>
        <p>
          <strong>Empates.</strong> A igualdad de puntos va delante el jugador con el hándicap más bajo (el de la final o,
          si no la jugó, el último de la temporada).
        </p>
        <p>
          <strong>Ranking histórico.</strong> Cada resultado vale según el puesto y el coeficiente del torneo (90 los
          normales, 100 la final).
          {last && <> Puntúan los {last} primeros puestos.</>}
          {e && (
            <>
              {' '}
              Durante {e} semanas el torneo cuenta entero; después va perdiendo valor hasta desaparecer a las {total} semanas.
            </>
          )}
        </p>
      </div>
    </details>
  )
}

// Aviso del próximo torneo con la inscripción abierta.
function NextTournament({ tournaments }) {
  const open = tournaments.filter((t) => t.n_results === 0 && signupState(t) === 'abierta')
  if (!open.length) return null
  const t = open[0]
  return (
    <Link className="next-banner" to={`/torneo/${t.id}`}>
      <span className="next-k">Próximo torneo · inscripción abierta</span>
      <span className="next-t">{t.course || t.name}</span>
      <span className="next-d">
        {formatDate(t.date)} · hasta el {formatWhen(t.signup_closes_at || `${t.date}T00:00:00Z`)}
      </span>
      <span className="next-cta">Apuntarme ›</span>
    </Link>
  )
}

export default function Home({ tab }) {
  const site = useSite()
  const [q, setQ] = useQueryState()
  const [query, setQuery] = useState('')
  const data = site.data
  const season = useMemo(() => {
    if (!data) return null
    return q.temporada && data.seasons.includes(q.temporada) ? q.temporada : data.currentSeason
  }, [data, q.temporada])

  const showSeason = tab !== 'ranking'
  const showSearch = tab !== 'torneos'

  return (
    <main className="wrap">
      <h1>Orden de Mérito</h1>
      <p className="lead">Clasificaciones y resultados de todos los torneos del club.</p>
      {site.data && <NextTournament tournaments={site.data.tournaments} />}

      <div className="tabs" role="tablist" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="panel"
            onClick={() => navigate(`${t.path}${qs(q)}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="controls">
          <Segmented value={q.modalidad} onChange={(m) => setQ({ modalidad: m })} options={MODALITIES} label="Modalidad" />
          {showSeason && season && data && (
            <SeasonSelect seasons={data.seasons} value={season} onChange={(s) => setQ({ temporada: s })} />
          )}
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

        <Status state={site}>
          {data && season && tab === 'clasificacion' && (
            <Annual season={season} modality={q.modalidad} query={query} site={data} />
          )}
          {tab === 'ranking' && <Ranking modality={q.modalidad} query={query} />}
          {data && season && tab === 'torneos' && <Tournaments site={data} season={season} q={{ ...q, temporada: season }} />}
        </Status>
      </section>

      {data && season && <Rules site={data} season={season} />}
    </main>
  )
}
