import { Fragment, useMemo, useState } from 'react'
import { Link } from '../router.jsx'
import { formatMonth, formatPoints, formatShortDate, normalize, posLabel } from '../lib/format.js'
import { Flag } from './ui.jsx'

const wide = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 720px)').matches

// Clasificación de la temporada.
// rows: salida de season_board(); tournaments: los de la temporada, por fecha.
export default function SeasonBoard({ rows, tournaments, config, query }) {
  const [view, setView] = useState(wide() ? 'grid' : 'list')
  const [open, setOpen] = useState(null)
  const q = normalize(query)
  const visible = q ? rows.filter((r) => normalize(r.nombre).includes(q)) : rows
  const hasDetail = rows.some((r) => r.detalle)
  const tieByHcp = rows.some((r) => r.por_hcp)

  if (!rows.length) return <p className="empty">Todavía no hay resultados en esta modalidad.</p>

  return (
    <>
      {hasDetail && (
        <div className="view-switch" role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            Resumen
          </button>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            Por torneo
          </button>
        </div>
      )}

      {!visible.length && <p className="empty">Ningún jugador coincide con «{query.trim()}».</p>}

      {visible.length > 0 && (view === 'list' || !hasDetail) && (
        <table className="board">
          <thead>
            <tr>
              <th scope="col" className="c-pos">Puesto</th>
              <th scope="col">Jugador</th>
              <th scope="col" className="c-pts">Puntos</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const isOpen = open === r.player_id
              return (
                <Fragment key={r.player_id}>
                  <tr
                    className={`${r.puesto === 1 ? 'leader' : ''}${hasDetail ? ' clickable' : ''}${isOpen ? ' open' : ''}`}
                    onClick={hasDetail ? () => setOpen(isOpen ? null : r.player_id) : undefined}
                  >
                    <td className="c-pos">{posLabel(r.puesto, r.compartido)}</td>
                    <td className="c-name">
                      {hasDetail ? (
                        <button type="button" className="row-btn" aria-expanded={isOpen}>
                          {r.puesto === 1 && <Flag />}
                          {r.nombre}
                        </button>
                      ) : (
                        <>
                          {r.puesto === 1 && <Flag />}
                          {r.nombre}
                        </>
                      )}
                      {(r.por_hcp || r.jugados != null) && (
                        <span className="meta">
                          {r.jugados != null && `${r.jugados} ${r.jugados === 1 ? 'torneo' : 'torneos'}`}
                          {r.por_hcp && <span className="hcp-tag">desempate por hándicap</span>}
                        </span>
                      )}
                    </td>
                    <td className="c-pts">{formatPoints(r.puntos)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="detail">
                      <td colSpan={3}>
                        <ul className="chips">
                          {tournaments.map((t) => {
                            const d = r.detalle?.[t.id]
                            return (
                              <li key={t.id} className={!d ? 'none' : d.c ? 'in' : 'out'}>
                                <Link to={`/torneo/${t.id}`} onClick={(e) => e.stopPropagation()}>
                                  <span className="chip-t">{t.is_final ? 'Final' : formatMonth(t.date)}</span>
                                  <span className="chip-c">{t.course || t.name}</span>
                                  <span className="chip-p">
                                    {d ? d.p : '–'}
                                    {d && t.is_final && <small> ×{formatPoints(config.final_multiplier, 0)}</small>}
                                  </span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      {visible.length > 0 && view === 'grid' && hasDetail && (
        <div className="grid-scroll" tabIndex={0} aria-label="Puntos por torneo; desliza para ver todos">
          <table className="grid">
            <thead>
              <tr>
                <th scope="col" className="g-pos">#</th>
                <th scope="col" className="g-name">Jugador</th>
                <th scope="col" className="g-tot">Total</th>
                {tournaments.map((t) => (
                  <th scope="col" key={t.id} className={`g-t${t.is_final ? ' final' : ''}`}>
                    <Link to={`/torneo/${t.id}`}>
                      <span>{t.is_final ? `Final ×${formatPoints(config.final_multiplier)}` : formatShortDate(t.date)}</span>
                      <small>{t.course || t.name}</small>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.player_id} className={r.puesto === 1 ? 'leader' : undefined}>
                  <td className="g-pos">{posLabel(r.puesto, r.compartido)}</td>
                  <td className="g-name">
                    {r.nombre}
                    {r.por_hcp && <span className="hcp-dot" title="Desempate por hándicap" aria-label="desempate por hándicap"> *</span>}
                  </td>
                  <td className="g-tot">{formatPoints(r.puntos)}</td>
                  {tournaments.map((t) => {
                    const d = r.detalle?.[t.id]
                    return (
                      <td key={t.id} className={`g-t${!d ? ' none' : d.c ? '' : ' out'}`}>
                        {d ? d.p : '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasDetail && (
        <p className="legend">
          Cuentan los {config.best_n} mejores resultados y la final, que vale ×{formatPoints(config.final_multiplier)}.
          <span className="out-sample">Tachado</span> = no cuenta.
          {tieByHcp && <> A igualdad de puntos va delante el hándicap más bajo{view === 'grid' ? ' (*)' : ''}.</>}
        </p>
      )}
    </>
  )
}

export function useSeasonTournaments(site, season) {
  return useMemo(
    () => (site ? site.tournaments.filter((t) => String(t.date).startsWith(String(season))) : []),
    [site, season],
  )
}
