import { useEffect, useMemo, useState } from 'react'
import api from '../data/api.js'
import { invalidateSite, useSite } from '../data/site.js'
import { Link } from '../router.jsx'
import { formatDate, fullName, normalize } from '../lib/format.js'
import { makeTeeTimes, publicList, signupState, whatsappText } from '../lib/signups.js'
import { useAsync } from '../lib/useAsync.js'
import { Status } from '../components/ui.jsx'

// datetime-local <-> ISO en hora local
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)
// Cierre por defecto: dos días antes del torneo a las 20:00
const defaultClose = (date) => {
  const d = new Date(`${date}T20:00:00`)
  d.setDate(d.getDate() - 2)
  return d.toISOString()
}
const STATE_TXT = { no_hay: 'Sin inscripción', sin_abrir: 'Programada', abierta: 'Abierta', cerrada: 'Cerrada' }

function Settings({ t, onSaved }) {
  const [f, setF] = useState({
    opens: toLocalInput(t.signup_opens_at),
    closes: toLocalInput(t.signup_closes_at || (t.signup_opens_at ? null : defaultClose(t.date))),
    max: t.max_players ?? '',
    notes: t.signup_notes ?? '',
  })
  const [msg, setMsg] = useState(null)
  const save = async (patch, text) => {
    setMsg(null)
    try {
      await api.updateTournament(t.id, patch)
      invalidateSite()
      onSaved()
      setMsg({ text })
    } catch (err) {
      setMsg({ error: true, text: `No se ha podido guardar: ${err.message}` })
    }
  }
  const submit = (e) => {
    e.preventDefault()
    const opens = fromLocalInput(f.opens)
    const closes = fromLocalInput(f.closes)
    if (opens && closes && closes <= opens) return setMsg({ error: true, text: 'El cierre tiene que ser después de la apertura.' })
    save(
      { signup_opens_at: opens, signup_closes_at: closes, max_players: f.max === '' ? null : Number(f.max), signup_notes: f.notes.trim() || null },
      'Guardado.',
    )
  }
  const state = signupState(t)
  return (
    <form className="form card" onSubmit={submit}>
      <div className="table-head">
        <h2 className="admin-h2">Inscripción</h2>
        <span className={`pill ${state}`}>{STATE_TXT[state]}</span>
      </div>
      <div className="form-grid">
        <label>
          <span>Se abre</span>
          <input type="datetime-local" value={f.opens} onChange={(e) => setF({ ...f, opens: e.target.value })} />
        </label>
        <label>
          <span>Se cierra</span>
          <input type="datetime-local" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} />
        </label>
        <label>
          <span>Plazas (vacío = sin límite)</span>
          <input type="number" min="1" max="300" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} />
        </label>
        <label>
          <span>Información para los jugadores</span>
          <textarea
            rows={3}
            maxLength={600}
            placeholder="Ej. Salidas desde las 9:00 por el tee del 1. Green fee 45 €."
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
        </label>
      </div>
      <div className="form-actions">
        <button className="btn primary" type="submit">
          Guardar
        </button>
        {state !== 'abierta' && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              const closes = t.signup_closes_at && new Date(t.signup_closes_at) > new Date() ? t.signup_closes_at : defaultClose(t.date)
              save({ signup_opens_at: new Date().toISOString(), signup_closes_at: closes }, 'Inscripción abierta.')
            }}
          >
            Abrir ahora
          </button>
        )}
        {state === 'abierta' && (
          <button className="btn" type="button" onClick={() => save({ signup_closes_at: new Date().toISOString() }, 'Inscripción cerrada.')}>
            Cerrar ahora
          </button>
        )}
      </div>
      {msg && <p className={msg.error ? 'form-error' : 'form-msg'}>{msg.text}</p>}
    </form>
  )
}

function AddSignup({ t, players, full, onAdded }) {
  const [q, setQ] = useState('')
  const [guest, setGuest] = useState('')
  const [contact, setContact] = useState('')
  const [msg, setMsg] = useState(null)
  const matches = useMemo(() => {
    const n = normalize(q)
    if (n.length < 2) return []
    return players.filter((p) => n.split(' ').every((w) => normalize(fullName(p)).includes(w))).slice(0, 5)
  }, [q, players])
  const add = async (row) => {
    setMsg(null)
    const c = contact.trim()
    try {
      await api.adminAddSignup({
        tournament_id: t.id,
        player_id: row.player_id ?? null,
        nombre: row.nombre,
        email: c.includes('@') ? c.toLowerCase() : null,
        phone: c && !c.includes('@') ? c : null,
        status: full ? 'reserva' : 'inscrito',
      })
      setQ('')
      setGuest('')
      setContact('')
      setMsg({ text: `${row.nombre} apuntado.` })
      onAdded()
    } catch (err) {
      setMsg({ error: true, text: /duplicate|unique/i.test(err.message) ? 'Ya está inscrito.' : err.message })
    }
  }
  return (
    <details className="card add-signup">
      <summary>Apuntar a alguien a mano</summary>
      <div className="form">
        <label>
          <span>Contacto (opcional): correo o teléfono</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
        <label>
          <span>Jugador de la Orden</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
        </label>
        {matches.length > 0 && (
          <ul className="picker-list">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add({ player_id: p.id, nombre: fullName(p), full })}>
                  + {fullName(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          <span>…o invitado (nombre y apellidos)</span>
          <span className="mini-form">
            <input value={guest} onChange={(e) => setGuest(e.target.value)} />
            <button className="btn" type="button" disabled={guest.trim().split(' ').length < 2} onClick={() => add({ nombre: guest.trim().replace(/\s+/g, ' '), full })}>
              Añadir
            </button>
          </span>
        </label>
        {msg && <p className={msg.error ? 'form-error' : 'form-msg'}>{msg.text}</p>}
      </div>
    </details>
  )
}

function TeeTimes({ rows, onApply }) {
  const [cfg, setCfg] = useState({ start: '09:00', every: 10, per: 4, hole: '' })
  return (
    <details className="card">
      <summary>Generar horarios automáticamente</summary>
      <p className="hint">Reparte a los inscritos en el orden de la tabla. Luego puedes retocar cada hora a mano.</p>
      <div className="form form-grid">
        <label>
          <span>Primera salida</span>
          <input type="time" value={cfg.start} onChange={(e) => setCfg({ ...cfg, start: e.target.value })} />
        </label>
        <label>
          <span>Minutos entre partidas</span>
          <input type="number" min="5" max="30" value={cfg.every} onChange={(e) => setCfg({ ...cfg, every: Number(e.target.value) })} />
        </label>
        <label>
          <span>Jugadores por partida</span>
          <input type="number" min="1" max="4" value={cfg.per} onChange={(e) => setCfg({ ...cfg, per: Number(e.target.value) })} />
        </label>
        <label>
          <span>Tee (opcional)</span>
          <input placeholder="Ej. Hoyo 1" value={cfg.hole} onChange={(e) => setCfg({ ...cfg, hole: e.target.value })} />
        </label>
      </div>
      <button className="btn" type="button" disabled={!rows.length} onClick={() => onApply(makeTeeTimes(rows, cfg))}>
        Repartir {rows.length} inscritos
      </button>
    </details>
  )
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function SignupRow({ s, n, teeValue, onTee, onStatus }) {
  return (
    <tr className={s.status === 'anulado' ? 'cancelled' : s.status === 'reserva' ? 'reserve-row' : undefined}>
      <td className="n">{n}</td>
      <td>
        <strong>{s.nombre}</strong>
        {!s.player_id && <span className="tag">invitado</span>}
        <span className="meta">
          {[s.hcp != null ? `Hcp ${String(s.hcp).replace('.', ',')}` : null, s.email, s.phone].filter(Boolean).map((x, i) => (
            <span key={i}>
              {x === s.email ? <a href={`mailto:${x}`}>{x}</a> : x === s.phone ? <a href={`tel:${x.replace(/\s/g, '')}`}>{x}</a> : x}
            </span>
          ))}
        </span>
        {s.comment && <span className="comment">“{s.comment}”</span>}
      </td>
      <td className="tee-cell">
        {s.status === 'inscrito' && (
          <input aria-label={`Horario de ${s.nombre}`} value={teeValue ?? ''} placeholder="Hora" onChange={(e) => onTee(e.target.value)} />
        )}
      </td>
      <td className="actions">
        <select aria-label={`Estado de ${s.nombre}`} value={s.status} onChange={(e) => onStatus(e.target.value)}>
          <option value="inscrito">Inscrito</option>
          <option value="reserva">Reserva</option>
          <option value="anulado">Anulado</option>
        </select>
      </td>
    </tr>
  )
}

export default function Signups({ id }) {
  const site = useSite()
  const state = useAsync(() => api.adminGetSignups(id), [id])
  const playersState = useAsync(() => api.getPlayers(), [])
  const [tee, setTee] = useState({})
  const [msg, setMsg] = useState(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const t = site.data?.tournaments.find((x) => x.id === id)
  const players = useMemo(
    () => [...(playersState.data || [])].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es')),
    [playersState.data],
  )
  const all = state.data || []
  useEffect(() => {
    setTee(Object.fromEntries(all.map((s) => [s.id, s.tee_time || ''])))
  }, [state.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const byTime = (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  const ins = all.filter((s) => s.status === 'inscrito').sort(byTime)
  const res = all.filter((s) => s.status === 'reserva').sort(byTime)
  const anul = all.filter((s) => s.status === 'anulado').sort(byTime)
  const teeDirty = all.some((s) => (s.tee_time || '') !== (tee[s.id] || ''))

  const setStatus = async (s, status) => {
    try {
      await api.adminUpdateSignup(s.id, { status })
      state.reload()
    } catch (err) {
      setMsg({ error: true, text: /duplicate|unique/i.test(err.message) ? 'Ese jugador ya tiene otra inscripción activa.' : err.message })
    }
  }
  const saveTee = async (publish) => {
    setMsg(null)
    try {
      await api.adminSetTeeTimes(all.filter((s) => (s.tee_time || '') !== (tee[s.id] || '')).map((s) => [s.id, tee[s.id]]))
      if (publish !== undefined) {
        await api.updateTournament(id, { tee_times_published: publish })
        invalidateSite()
      }
      state.reload()
      setMsg({ text: publish === true ? 'Horarios publicados en la web.' : publish === false ? 'Horarios ocultos.' : 'Horarios guardados (sin publicar).' })
    } catch (err) {
      setMsg({ error: true, text: err.message })
    }
  }
  const copy = (text, label) => {
    navigator.clipboard?.writeText(text).then(
      () => setMsg({ text: `${label} copiado. Pégalo en el grupo de WhatsApp.` }),
      () => setMsg({ error: true, text: 'No se ha podido copiar.' }),
    )
  }
  const exportCsv = () => {
    const head = ['Estado', 'Nº', 'Nombre', 'Hándicap', 'Correo', 'Teléfono', 'Horario', 'Comentario', 'Inscrito el']
    const lines = [...ins, ...res].map((s, i) =>
      [s.status, s.status === 'inscrito' ? i + 1 : i + 1 - ins.length, s.nombre, s.hcp ?? '', s.email ?? '', s.phone ?? '', tee[s.id] || '', s.comment ?? '', new Date(s.created_at).toLocaleString('es-ES')]
        .map(csvCell)
        .join(';'),
    )
    const blob = new Blob([`﻿${[head.join(';'), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `inscritos-${t.course || t.name}-${t.date}.csv`.replace(/\s+/g, '_')
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const listForText = () =>
    publicList({ ...t, tee_times_published: true }, all.map((s) => ({ ...s, tee_time: tee[s.id] || null })))
  const url = `${window.location.origin}/torneo/${id}`

  return (
    <Status state={{ loading: site.loading || state.loading, error: site.error || state.error, data: true }}>
      {site.data && !t && <p className="status">Este torneo no existe.</p>}
      {t && (
        <>
          <p className="crumb">
            <Link to="/admin">‹ Torneos</Link>
          </p>
          <h1 className="admin-h">{t.course || t.name}</h1>
          <p className="lead">
            {formatDate(t.date)} · <Link to={`/torneo/${t.id}`}>ver página pública</Link> ·{' '}
            <Link to={`/admin/torneo/${t.id}`}>resultados</Link>
          </p>

          <Settings key={`${t.signup_opens_at}-${t.signup_closes_at}-${t.max_players}`} t={t} onSaved={state.reload} />

          <div className="table-head">
            <h2 className="admin-h2">
              {ins.length} inscritos{t.max_players ? ` de ${t.max_players}` : ''}
              {res.length > 0 && ` · ${res.length} en reserva`}
            </h2>
          </div>
          <div className="form-actions wrap-actions">
            <button className="btn" type="button" disabled={!ins.length} onClick={() => copy(whatsappText({ t, list: listForText(), kind: 'lista', url }), 'Listado')}>
              Copiar lista para WhatsApp
            </button>
            <button
              className="btn"
              type="button"
              disabled={!ins.some((s) => tee[s.id])}
              onClick={() => copy(whatsappText({ t, list: listForText(), kind: 'horarios', url }), 'Horarios')}
            >
              Copiar horarios para WhatsApp
            </button>
            <button className="btn" type="button" disabled={!all.length} onClick={exportCsv}>
              Exportar CSV (para el campo)
            </button>
          </div>

          <AddSignup t={t} players={players} full={Boolean(t.max_players && ins.length >= t.max_players)} onAdded={state.reload} />

          {all.length === 0 ? (
            <p className="empty">Todavía no hay nadie apuntado.</p>
          ) : (
            <div className="edit-scroll">
              <table className="edit signups-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Horario</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ins.map((s, i) => (
                    <SignupRow key={s.id} s={s} n={i + 1} teeValue={tee[s.id]} onTee={(v) => setTee({ ...tee, [s.id]: v })} onStatus={(st) => setStatus(s, st)} />
                  ))}
                  {res.length > 0 && (
                    <tr className="group-row">
                      <td colSpan={4}>Reserva (por orden de llegada)</td>
                    </tr>
                  )}
                  {res.map((s, i) => (
                    <SignupRow key={s.id} s={s} n={`R${i + 1}`} teeValue={tee[s.id]} onTee={(v) => setTee({ ...tee, [s.id]: v })} onStatus={(st) => setStatus(s, st)} />
                  ))}
                  {showCancelled && anul.map((s) => <SignupRow key={s.id} s={s} n="–" teeValue={tee[s.id]} onTee={(v) => setTee({ ...tee, [s.id]: v })} onStatus={(st) => setStatus(s, st)} />)}
                </tbody>
              </table>
            </div>
          )}
          {anul.length > 0 && (
            <button type="button" className="link-btn small" onClick={() => setShowCancelled(!showCancelled)}>
              {showCancelled ? 'Ocultar' : 'Ver'} {anul.length} anuladas
            </button>
          )}

          {ins.length > 0 && (
            <>
              <TeeTimes rows={ins.map((s) => s.nombre)} onApply={(times) => setTee({ ...tee, ...Object.fromEntries(ins.map((s, i) => [s.id, times[i]])) })} />
              <div className="save-bar static">
                <button className="btn" type="button" disabled={!teeDirty} onClick={() => saveTee()}>
                  Guardar horarios
                </button>
                {t.tee_times_published ? (
                  <button className="btn" type="button" onClick={() => saveTee(false)}>
                    Ocultar horarios
                  </button>
                ) : (
                  <button className="btn primary" type="button" disabled={!ins.some((s) => tee[s.id])} onClick={() => saveTee(true)}>
                    Publicar horarios
                  </button>
                )}
                {t.tee_times_published && <span className="form-msg">Horarios publicados</span>}
              </div>
            </>
          )}
          {msg && (
            <p className={msg.error ? 'form-error' : 'form-msg'} role="status">
              {msg.text}
            </p>
          )}
        </>
      )}
    </Status>
  )
}
