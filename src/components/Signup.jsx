import { useMemo, useState } from 'react'
import api from '../data/api.js'
import { Link } from '../router.jsx'
import { fullName, normalize } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

// Inscripciones hechas desde este navegador, para poder verlas o anularlas luego.
const KEY = 'om-mis-inscripciones'
export function savedSignups() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}
function rememberSignup(tid, entry) {
  try {
    const all = savedSignups()
    all[tid] = [...(all[tid] || []).filter((x) => x.token !== entry.token), entry]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* sin almacenamiento */
  }
}

export const formatWhen = (iso) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export const cancelUrl = (token) => `${window.location.origin}/inscripcion/${token}`

function PlayerPicker({ players, value, onChange }) {
  const [q, setQ] = useState('')
  const [guest, setGuest] = useState(false)
  const matches = useMemo(() => {
    const n = normalize(q)
    if (n.length < 2) return []
    const words = n.split(' ')
    return players.filter((p) => words.every((w) => normalize(fullName(p)).includes(w))).slice(0, 6)
  }, [q, players])

  if (value.player_id) {
    const p = players.find((x) => x.id === value.player_id)
    return (
      <div className="picked">
        <span>{fullName(p)}</span>
        <button type="button" className="link-btn" onClick={() => onChange({ player_id: null, nombre: '' })}>
          Cambiar
        </button>
      </div>
    )
  }
  if (guest) {
    return (
      <label>
        <span>Nombre y apellidos</span>
        <input
          autoComplete="name"
          required
          value={value.nombre}
          onChange={(e) => onChange({ player_id: null, nombre: e.target.value })}
          placeholder="Nombre Apellido Apellido"
        />
        <button type="button" className="link-btn small" onClick={() => setGuest(false)}>
          Buscarme en la lista
        </button>
      </label>
    )
  }
  return (
    <div className="picker">
      <label>
        <span>Busca tu nombre</span>
        <input
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escribe tu nombre o apellido"
        />
      </label>
      {matches.length > 0 && (
        <ul className="picker-list">
          {matches.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange({ player_id: p.id, nombre: '' })}>
                {fullName(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !matches.length && <p className="hint">No te encuentro en la lista de la Orden.</p>}
      <button type="button" className="link-btn small" onClick={() => setGuest(true)}>
        No estoy en la lista (invitado o nuevo)
      </button>
    </div>
  )
}

function SignupForm({ t, status, onDone }) {
  const playersState = useAsync(() => api.getPlayers(), [])
  const players = useMemo(
    () => [...(playersState.data || [])].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es')),
    [playersState.data],
  )
  const [f, setF] = useState({ player_id: null, nombre: '', email: '', phone: '', hcp: '', comment: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const full = status.plazas && status.inscritos >= status.plazas

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!f.player_id && !f.nombre.trim()) return setError('Elige tu nombre de la lista o escribe nombre y apellidos.')
    if (!f.email.trim() && !f.phone.trim()) return setError('Deja un correo o un teléfono para poder avisarte.')
    setBusy(true)
    try {
      const res = await api.createSignup({ tournament_id: t.id, ...f })
      rememberSignup(t.id, { token: res.token, nombre: res.nombre })
      onDone(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form signup-form" onSubmit={submit}>
      <PlayerPicker players={players} value={f} onChange={(p) => setF({ ...f, ...p })} />
      <div className="form-grid">
        <label>
          <span>Correo</span>
          <input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label>
          <span>Teléfono</span>
          <input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </label>
      </div>
      <p className="hint">Al menos uno de los dos. Solo lo ve el organizador, para avisarte de horarios o cambios.</p>
      <div className="form-grid">
        <label>
          <span>Hándicap (opcional)</span>
          <input inputMode="decimal" value={f.hcp} onChange={(e) => setF({ ...f, hcp: e.target.value })} />
        </label>
        <label>
          <span>Comentario (opcional)</span>
          <input
            maxLength={300}
            placeholder="Ej. salir con…"
            value={f.comment}
            onChange={(e) => setF({ ...f, comment: e.target.value })}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary big" type="submit" disabled={busy}>
        {busy ? 'Apuntando…' : full ? 'Apuntarme a la reserva' : 'Apuntarme'}
      </button>
    </form>
  )
}

function Done({ res, onAgain }) {
  const [copied, setCopied] = useState(false)
  const url = cancelUrl(res.token)
  return (
    <div className="signup-done" role="status">
      <p className="done-title">
        {res.estado === 'reserva' ? `${res.nombre}, estás en la lista de reserva.` : `¡Listo, ${res.nombre}! Estás inscrito.`}
      </p>
      {res.estado === 'reserva' && <p>Si alguien se borra, entras automáticamente por orden de inscripción.</p>}
      <p>
        Guarda este enlace: con él puedes ver tu inscripción y anularla.{' '}
        <Link to={`/inscripcion/${res.token}`}>Ver mi inscripción</Link>
      </p>
      <div className="copy-row">
        <input readOnly value={url} aria-label="Enlace de tu inscripción" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <button type="button" className="link-btn small" onClick={onAgain}>
        Apuntar a otra persona
      </button>
    </div>
  )
}

export default function SignupSection({ t }) {
  const statusState = useAsync(() => api.getSignupStatus(t.id), [t.id])
  const listState = useAsync(() => api.getSignupList(t.id), [t.id])
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(null)
  const mine = savedSignups()[t.id] || []
  const s = statusState.data

  if (statusState.loading && !s) return null
  if (!s || s.estado === 'no_hay') return null

  const list = listState.data || []
  const ins = list.filter((x) => x.estado === 'inscrito')
  const res = list.filter((x) => x.estado === 'reserva')
  const reload = () => {
    statusState.reload()
    listState.reload()
  }

  return (
    <section className="signup" aria-labelledby="signup-h">
      <h2 id="signup-h" className="section-h">
        Inscripción
      </h2>
      <p className={`signup-state ${s.estado}`}>
        {s.estado === 'abierta' && <>Abierta hasta el {formatWhen(s.cierra)}.</>}
        {s.estado === 'sin_abrir' && <>Se abre el {formatWhen(s.abre)}.</>}
        {s.estado === 'cerrada' && <>Inscripción cerrada.</>}{' '}
        <strong>
          {s.inscritos} {s.inscritos === 1 ? 'inscrito' : 'inscritos'}
          {s.plazas ? ` de ${s.plazas} plazas` : ''}
        </strong>
        {s.reservas > 0 && <> · {s.reservas} en reserva</>}
      </p>
      {s.notas && <p className="signup-notes">{s.notas}</p>}

      {mine.length > 0 && (
        <ul className="mine">
          {mine.map((m) => (
            <li key={m.token}>
              Te apuntaste como <strong>{m.nombre}</strong> · <Link to={`/inscripcion/${m.token}`}>ver o anular</Link>
            </li>
          ))}
        </ul>
      )}

      {s.estado === 'abierta' &&
        (done ? (
          <Done
            res={done}
            onAgain={() => {
              setDone(null)
              setOpen(true)
            }}
          />
        ) : open ? (
          <SignupForm
            t={t}
            status={s}
            onDone={(r) => {
              setDone(r)
              setOpen(false)
              reload()
            }}
          />
        ) : (
          <button className="btn primary big" type="button" onClick={() => setOpen(true)}>
            {s.plazas && s.inscritos >= s.plazas ? 'Apuntarme a la reserva' : 'Apuntarme'}
          </button>
        ))}

      {list.length > 0 && (
        <>
          <h3 className="sub-h">{s.horarios ? 'Horarios de salida' : 'Inscritos'}</h3>
          <ol className={`signup-list${s.horarios ? ' with-times' : ''}`}>
            {ins.map((x, i) => (
              <li key={`i${i}`}>
                {s.horarios && <span className="tee">{x.horario || '—'}</span>}
                <span>{x.nombre}</span>
              </li>
            ))}
          </ol>
          {res.length > 0 && (
            <>
              <h3 className="sub-h">Reserva</h3>
              <ol className="signup-list reserve">
                {res.map((x, i) => (
                  <li key={`r${i}`}>{x.nombre}</li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  )
}
