import { useEffect, useState } from 'react'
import api, { DEMO } from '../data/api.js'
import { Link, match } from '../router.jsx'
import Login from './Login.jsx'
import Tournaments from './Tournaments.jsx'
import Results from './Results.jsx'
import Players from './Players.jsx'
import Rules from './Rules.jsx'

const NAV = [
  { to: '/admin', label: 'Torneos' },
  { to: '/admin/jugadores', label: 'Jugadores' },
  { to: '/admin/reglas', label: 'Reglas' },
]

function useAdminSession() {
  const [state, setState] = useState({ checking: true, session: null, admin: false, error: null })
  useEffect(() => {
    let alive = true
    const check = async (session) => {
      if (!session) return alive && setState({ checking: false, session: null, admin: false, error: null })
      try {
        const admin = await api.isAdmin()
        if (alive) setState({ checking: false, session, admin, error: null })
      } catch (error) {
        if (alive) setState({ checking: false, session, admin: false, error })
      }
    }
    api.getSession().then(check, (error) => alive && setState({ checking: false, session: null, admin: false, error }))
    const off = api.onAuthChange((s) => check(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

function Section({ path }) {
  const r = match('/admin/torneo/:id', path)
  if (r) return <Results key={r.id} id={Number(r.id)} />
  if (path === '/admin/jugadores') return <Players />
  if (path === '/admin/reglas') return <Rules />
  return <Tournaments />
}

export default function Admin({ path }) {
  const s = useAdminSession()

  if (s.checking) return <p className="wrap status">Comprobando sesión…</p>
  if (!s.session) return <Login />
  if (!s.admin)
    return (
      <main className="wrap admin">
        <h1 className="admin-h">Sin acceso</h1>
        <p className="lead">
          {s.error ? s.error.message : `El usuario ${s.session.user?.email} no es administrador.`}
        </p>
        <button type="button" className="btn" onClick={() => api.signOut()}>
          Cerrar sesión
        </button>
      </main>
    )

  const active = path.startsWith('/admin/torneo') ? '/admin' : path
  return (
    <main className="wrap admin">
      <nav className="admin-nav" aria-label="Administración">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} aria-current={active === n.to ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
        <span className="admin-nav-right">
          <Link to="/">Ver web</Link>
          {!DEMO && (
            <button type="button" className="link-btn" onClick={() => api.signOut()}>
              Salir
            </button>
          )}
        </span>
      </nav>
      <Section path={path} />
    </main>
  )
}
