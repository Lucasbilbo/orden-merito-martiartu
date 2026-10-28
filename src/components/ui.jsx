import { DEMO, resetDemo } from '../data/api.js'
import { Link } from '../router.jsx'

export function Flag() {
  return (
    <svg className="flag" viewBox="0 0 16 20" width="14" height="18" aria-hidden="true">
      <path d="M3 1v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M3.8 2.2 14 5.6 3.8 9.4Z" fill="currentColor" />
    </svg>
  )
}

export function Status({ state, children, empty }) {
  if (state.loading && !state.data) return <p className="status" role="status">Cargando…</p>
  if (state.error)
    return (
      <p className="status error" role="alert">
        No se han podido cargar los datos. Recarga la página para intentarlo de nuevo.
      </p>
    )
  if (empty) return <p className="empty">{empty}</p>
  return children
}

export function Segmented({ value, onChange, options, label, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SeasonSelect({ seasons, value, onChange }) {
  return (
    <label className="season">
      <span>Temporada</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DemoBanner() {
  if (!DEMO) return null
  return (
    <div className="demo-banner" role="note">
      <div className="wrap demo-in">
        <span>
          <strong>Modo demo.</strong> Datos inventados, solo en este navegador.
        </span>
        <span className="demo-actions">
          <button
            type="button"
            onClick={() => {
              resetDemo()
              window.location.reload()
            }}
          >
            Restablecer
          </button>
          <a href="/?demo=0">Salir</a>
        </span>
      </div>
    </div>
  )
}

export function Header({ admin }) {
  return (
    <header className="top">
      <div className="wrap top-in">
        <Link className="brand" to="/">
          Club Deportivo <span>Martiartu</span>
        </Link>
        {admin && <span className="top-tag">Administración</span>}
      </div>
    </header>
  )
}
