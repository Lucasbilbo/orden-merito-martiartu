import { useMemo, useState } from 'react'
import api from '../data/api.js'
import { invalidateSite } from '../data/site.js'
import { fullName, normalize } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'
import { Status } from '../components/ui.jsx'

const blank = { nombre: '', apellido1: '', apellido2: '', handicap: '' }

function PlayerForm({ initial, onSave, onCancel, submitLabel }) {
  const [f, setF] = useState({ ...blank, ...initial, handicap: initial?.handicap ?? '' })
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    const h = String(f.handicap).replace(',', '.')
    if (h !== '' && (Number.isNaN(Number(h)) || Number(h) < -10 || Number(h) > 54)) return setError('Hándicap no válido.')
    try {
      await onSave({ ...f, nombre: f.nombre.trim(), apellido1: f.apellido1.trim(), apellido2: f.apellido2.trim(), handicap: h })
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <form className="form card" onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span>Nombre</span>
          <input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </label>
        <label>
          <span>Primer apellido</span>
          <input value={f.apellido1 || ''} onChange={(e) => setF({ ...f, apellido1: e.target.value })} />
        </label>
        <label>
          <span>Segundo apellido</span>
          <input value={f.apellido2 || ''} onChange={(e) => setF({ ...f, apellido2: e.target.value })} />
        </label>
        <label>
          <span>Hándicap actual (privado)</span>
          <input inputMode="decimal" value={f.handicap} onChange={(e) => setF({ ...f, handicap: e.target.value })} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          {submitLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export default function Players() {
  const state = useAsync(() => api.adminGetPlayers(), [])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const list = useMemo(() => {
    const q = normalize(query)
    return [...(state.data || [])]
      .filter((p) => !q || normalize(fullName(p)).includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'))
  }, [state.data, query])

  const done = () => {
    setEditing(null)
    setAdding(false)
    invalidateSite()
    state.reload()
  }

  return (
    <>
      <h1 className="admin-h">Jugadores</h1>
      <p className="lead">
        En la web pública solo se ve el nombre. El hándicap actual sirve para desempatar cuando un jugador no tiene
        hándicap en los torneos de la temporada; al guardar resultados se actualiza solo.
      </p>
      {adding ? (
        <PlayerForm submitLabel="Crear jugador" onCancel={() => setAdding(false)} onSave={async (f) => (await api.createPlayer(f), done())} />
      ) : (
        <button className="btn primary" type="button" onClick={() => setAdding(true)}>
          Añadir jugador
        </button>
      )}
      <input className="search" type="search" placeholder="Buscar jugador" aria-label="Buscar jugador" value={query} onChange={(e) => setQuery(e.target.value)} />
      <Status state={state}>
        <p className="note">{list.length} jugadores</p>
        <ul className="admin-list">
          {list.map((p) =>
            editing === p.id ? (
              <li key={p.id}>
                <PlayerForm
                  initial={p}
                  submitLabel="Guardar"
                  onCancel={() => setEditing(null)}
                  onSave={async (f) => (await api.updatePlayer(p.id, f), done())}
                />
              </li>
            ) : (
              <li key={p.id} className="admin-row compact">
                <div className="admin-row-main">
                  <strong>{fullName(p)}</strong>
                  <span className="admin-row-meta">{p.handicap != null ? `Hcp ${String(p.handicap).replace('.', ',')}` : 'Sin hándicap'}</span>
                </div>
                <div className="admin-row-actions">
                  <button className="btn" type="button" onClick={() => setEditing(p.id)}>
                    Editar
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      </Status>
    </>
  )
}
