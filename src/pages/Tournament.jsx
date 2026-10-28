import api from '../data/api.js'
import { useSite } from '../data/site.js'
import { Link } from '../router.jsx'
import { formatDate, formatPoints, fullName, MODALITIES, seasonOf } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'
import { Flag, Segmented, Status } from '../components/ui.jsx'
import { qs, useQueryState } from './Home.jsx'

export default function Tournament({ id }) {
  const site = useSite()
  const [q, setQ] = useQueryState()
  const tid = Number(id)
  const state = useAsync(() => api.getTournamentResults(tid), [tid])
  const all = site.data?.tournaments || []
  const idx = all.findIndex((t) => t.id === tid)
  const t = all[idx]

  if (site.data && !t) {
    return (
      <main className="wrap">
        <p className="status">Este torneo no existe.</p>
        <Link to="/torneos">Ver todos los torneos</Link>
      </main>
    )
  }

  const season = t ? seasonOf(t) : null
  const back = { ...q, temporada: season }
  const rows = (state.data || []).filter((r) => r.modality === q.modalidad)
  const shared = {}
  rows.forEach((r) => r.position != null && (shared[r.position] = (shared[r.position] || 0) + 1))
  const prev = all[idx - 1]
  const next = all[idx + 1]

  return (
    <main className="wrap">
      <Status state={site}>
        {t && (
          <>
            <p className="crumb">
              <Link to={`/torneos${qs(back)}`}>‹ Torneos {season}</Link>
            </p>
            <h1 className="t-title">{t.course || t.name}</h1>
            <p className="lead">
              {formatDate(t.date)}
              {t.is_final && (
                <>
                  {' · '}
                  <span className="badge">Final, puntúa ×{formatPoints(site.data.config(season).final_multiplier)}</span>
                </>
              )}
            </p>

            <div className="controls">
              <Segmented value={q.modalidad} onChange={(m) => setQ({ modalidad: m })} options={MODALITIES} label="Modalidad" />
            </div>

            <Status state={state}>
              {rows.length ? (
                <table className="board">
                  <thead>
                    <tr>
                      <th scope="col" className="c-pos">Puesto</th>
                      <th scope="col">Jugador</th>
                      <th scope="col" className="c-pts">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.player_id} className={r.position === 1 ? 'leader' : undefined}>
                        <td className="c-pos">{r.position == null ? '–' : shared[r.position] > 1 ? `T${r.position}` : r.position}</td>
                        <td className="c-name">
                          {r.position === 1 && <Flag />}
                          {r.players ? fullName(r.players) : 'Jugador sin identificar'}
                        </td>
                        <td className="c-pts">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty">
                  {t.n_results > 0
                    ? `No hay resultados de ${q.modalidad === 'scratch' ? 'Scratch' : 'Stableford'} en este torneo.`
                    : 'Este torneo todavía no se ha jugado.'}
                </p>
              )}
            </Status>

            <nav className="pager" aria-label="Otros torneos">
              {prev ? (
                <Link to={`/torneo/${prev.id}${qs({ ...q, temporada: seasonOf(prev) })}`} className="pager-prev">
                  <small>Anterior</small>
                  {prev.course || prev.name}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link to={`/torneo/${next.id}${qs({ ...q, temporada: seasonOf(next) })}`} className="pager-next">
                  <small>Siguiente</small>
                  {next.course || next.name}
                </Link>
              )}
            </nav>
            <p>
              <Link to={`/${qs(back)}`}>Ver la clasificación de {season}</Link>
            </p>
          </>
        )}
      </Status>
    </main>
  )
}
