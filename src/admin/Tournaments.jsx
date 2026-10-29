import { useEffect, useState } from 'react'
import api from '../data/api.js'
import { invalidateSite, useSite } from '../data/site.js'
import { Link } from '../router.jsx'
import { formatDate, seasonOf } from '../lib/format.js'
import { Status } from '../components/ui.jsx'
import { signupState } from '../lib/signups.js'

const STATE_SHORT = { sin_abrir: 'programada', abierta: 'abierta', cerrada: 'cerrada' }

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Nombre interno con el formato del sistema antiguo: OMFebrero26, y OMMayo26_2 si se repite el mes.
export function autoName(date, existing) {
  const base = `OM${MONTHS[Number(date.slice(5, 7)) - 1]}${date.slice(2, 4)}`
  let name = base
  for (let i = 2; existing.includes(name); i++) name = `${base}_${i}`
  return name
}

function SeasonSettings({ year, row, onSaved }) {
  const [best, setBest] = useState(row?.best_n ?? 4)
  const [mult, setMult] = useState(row?.final_multiplier ?? 2)
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    setBest(row?.best_n ?? 4)
    setMult(row?.final_multiplier ?? 2)
    setMsg(null)
  }, [year, row])
  const save = async (e) => {
    e.preventDefault()
    try {
      await api.upsertSeason({ year, best_n: Number(best), final_multiplier: Number(mult) })
      setMsg('Guardado. La clasificación ya usa estas reglas.')
      onSaved()
    } catch (err) {
      setMsg(`No se ha podido guardar: ${err.message}`)
    }
  }
  return (
    <form className="form inline-form" onSubmit={save}>
      <label>
        <span>Resultados que cuentan</span>
        <input type="number" min="1" max="20" value={best} onChange={(e) => setBest(e.target.value)} required />
      </label>
      <label>
        <span>Multiplicador final</span>
        <input type="number" min="0.5" max="9" step="0.5" value={mult} onChange={(e) => setMult(e.target.value)} required />
      </label>
      <button className="btn" type="submit">
        Guardar reglas
      </button>
      {msg && <p className="form-msg">{msg}</p>}
    </form>
  )
}

function TournamentForm({ initial, existingNames, onDone, onCancel, defaultYear }) {
  const [f, setF] = useState(
    initial || { date: `${defaultYear}-01-01`, course: '', is_final: false, coeficiente: 90, name: '' },
  )
  const [error, setError] = useState(null)
  const set = (k, v) =>
    setF((x) => {
      const n = { ...x, [k]: v }
      if (k === 'is_final' && (x.coeficiente === 90 || x.coeficiente === 100)) n.coeficiente = v ? 100 : 90
      return n
    })
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const others = existingNames.filter((n) => n !== initial?.name)
    const name = f.name.trim() || autoName(f.date, others)
    if (others.includes(name)) return setError('Ya hay un torneo con ese nombre interno.')
    const row = { name, date: f.date, course: f.course.trim() || null, is_final: f.is_final, coeficiente: Number(f.coeficiente) }
    try {
      if (initial) await api.updateTournament(initial.id, row)
      else await api.createTournament(row)
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <form className="form card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span>Fecha</span>
          <input type="date" required value={f.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <label>
          <span>Campo</span>
          <input required placeholder="Ej. Meaztegi" value={f.course || ''} onChange={(e) => set('course', e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.is_final} onChange={(e) => set('is_final', e.target.checked)} />
          <span>Es la final (puntúa doble)</span>
        </label>
        <label>
          <span>Coeficiente ranking</span>
          <input type="number" min="1" max="200" value={f.coeficiente} onChange={(e) => set('coeficiente', e.target.value)} />
        </label>
        <label>
          <span>Nombre interno (opcional)</span>
          <input placeholder={autoName(f.date || '2000-01-01', existingNames)} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          {initial ? 'Guardar cambios' : 'Crear torneo'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default function Tournaments() {
  const site = useSite()
  const [year, setYear] = useState(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [newYear, setNewYear] = useState('')
  const [msg, setMsg] = useState(null)
  const data = site.data

  useEffect(() => {
    if (data && (year === null || !data.seasons.includes(year))) {
      const now = new Date().getFullYear()
      setYear(data.seasons.includes(now) ? now : data.seasons[0] ?? now)
    }
  }, [data, year])

  const refresh = () => invalidateSite()

  const addSeason = async (e) => {
    e.preventDefault()
    const y = Number(newYear)
    if (!y || y < 2000 || y > 2100) return setMsg('Año no válido.')
    try {
      await api.upsertSeason({ year: y })
      setNewYear('')
      setYear(y)
      setMsg(`Temporada ${y} creada. Ahora añade sus torneos.`)
      refresh()
    } catch (err) {
      setMsg(`No se ha podido crear: ${err.message}`)
    }
  }

  const remove = async (t) => {
    const extra = t.n_results ? ` Se borrarán también sus ${t.n_results} resultados.` : ''
    if (!window.confirm(`¿Borrar el torneo de ${t.course || t.name} (${formatDate(t.date)})?${extra} No se puede deshacer.`)) return
    try {
      await api.deleteTournament(t.id)
      refresh()
    } catch (err) {
      setMsg(`No se ha podido borrar: ${err.message}`)
    }
  }

  return (
    <Status state={site}>
      {data && year && (
        <>
          <h1 className="admin-h">Torneos</h1>
          <div className="controls">
            <label className="season">
              <span>Temporada</span>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {[...new Set([year, ...data.seasons])]
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>
            </label>
            <form className="mini-form" onSubmit={addSeason}>
              <input
                type="number"
                placeholder="Año"
                aria-label="Año de la nueva temporada"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
              />
              <button className="btn" type="submit">
                Nueva temporada
              </button>
            </form>
          </div>
          {msg && (
            <p className="form-msg" role="status">
              {msg}
            </p>
          )}

          <h2 className="admin-h2">Reglas de {year}</h2>
          <SeasonSettings year={year} row={data.seasonRows.find((s) => s.year === year)} onSaved={refresh} />

          <h2 className="admin-h2">Torneos de {year}</h2>
          {(() => {
            const list = data.tournaments.filter((t) => seasonOf(t) === year)
            const names = data.tournaments.map((t) => t.name)
            return (
              <>
                {!list.length && <p className="empty">Todavía no hay torneos en {year}.</p>}
                <ul className="admin-list">
                  {list.map((t) =>
                    editing === t.id ? (
                      <li key={t.id}>
                        <TournamentForm
                          initial={{ ...t, course: t.course || '' }}
                          existingNames={names}
                          defaultYear={year}
                          onDone={() => {
                            setEditing(null)
                            refresh()
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </li>
                    ) : (
                      <li key={t.id} className="admin-row">
                        <div className="admin-row-main">
                          <span className="t-date">{formatDate(t.date)}</span>
                          <strong>{t.course || t.name}</strong>
                          <span className="admin-row-meta">
                            {t.is_final && <span className="badge">Final</span>}
                            {t.n_results ? `${t.n_results} resultados (Stb + Scr)` : <span className="pending">Sin resultados</span>}
                            {!t.n_results && signupState(t) !== 'no_hay' && (
                              <span className={`pill ${signupState(t)}`}>Inscripción {STATE_SHORT[signupState(t)]}</span>
                            )}
                          </span>
                        </div>
                        <div className="admin-row-actions">
                          {t.n_results ? (
                            <Link className="btn primary" to={`/admin/torneo/${t.id}`}>
                              Resultados
                            </Link>
                          ) : (
                            <>
                              <Link className="btn primary" to={`/admin/torneo/${t.id}/inscripciones`}>
                                Inscripciones
                              </Link>
                              <Link className="btn" to={`/admin/torneo/${t.id}`}>
                                Resultados
                              </Link>
                            </>
                          )}
                          <button className="btn" type="button" onClick={() => setEditing(t.id)}>
                            Editar
                          </button>
                          <button className="btn danger" type="button" onClick={() => remove(t)}>
                            Borrar
                          </button>
                        </div>
                      </li>
                    ),
                  )}
                </ul>
                {adding ? (
                  <TournamentForm
                    existingNames={names}
                    defaultYear={year}
                    onDone={() => {
                      setAdding(false)
                      refresh()
                    }}
                    onCancel={() => setAdding(false)}
                  />
                ) : (
                  <button className="btn primary" type="button" onClick={() => setAdding(true)}>
                    Añadir torneo
                  </button>
                )}
              </>
            )
          })()}
        </>
      )}
    </Status>
  )
}
