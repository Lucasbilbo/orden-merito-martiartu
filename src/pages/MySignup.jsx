import { useState } from 'react'
import api from '../data/api.js'
import { Link } from '../router.jsx'
import { formatDate } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'
import { Status } from '../components/ui.jsx'

const LABEL = { inscrito: 'Inscrito', reserva: 'En lista de reserva', anulado: 'Anulada' }

export default function MySignup({ token }) {
  const state = useAsync(() => api.lookupSignup(token), [token])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const s = state.data

  const cancel = async () => {
    if (!window.confirm('¿Seguro que quieres anular tu inscripción?')) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api.cancelSignup(token)
      setMsg({ text: r.sube_de_reserva ? `Anulada. Tu plaza pasa a ${r.sube_de_reserva}.` : 'Inscripción anulada.' })
      state.reload()
    } catch (e) {
      setMsg({ error: true, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="wrap">
      <h1 className="admin-h">Mi inscripción</h1>
      <Status state={state}>
        {!s ? (
          <p className="status">No encuentro esta inscripción. Revisa que el enlace esté completo.</p>
        ) : (
          <div className="card my-signup">
            <p className="t-date">{formatDate(s.fecha)}</p>
            <p className="my-t">{s.torneo}</p>
            <p>
              <strong>{s.nombre}</strong>
            </p>
            <p className={`pill ${s.estado}`}>{LABEL[s.estado]}</p>
            {s.horario && (
              <p>
                Hora de salida: <strong>{s.horario}</strong>
              </p>
            )}
            <div className="form-actions">
              <Link className="btn" to={`/torneo/${s.tournament_id}`}>
                Ver el torneo
              </Link>
              {s.puede_anular && (
                <button className="btn danger" type="button" onClick={cancel} disabled={busy}>
                  {busy ? 'Anulando…' : 'Anular inscripción'}
                </button>
              )}
            </div>
            {msg && (
              <p className={msg.error ? 'form-error' : 'form-msg'} role="status">
                {msg.text}
              </p>
            )}
          </div>
        )}
      </Status>
    </main>
  )
}
