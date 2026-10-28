import { lazy, Suspense } from 'react'
import { match, usePath, Link } from './router.jsx'
import { DemoBanner, Header } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import Tournament from './pages/Tournament.jsx'

const Admin = lazy(() => import('./admin/Admin.jsx'))

function NotFound() {
  return (
    <main className="wrap">
      <h1>No encontrado</h1>
      <p className="lead">Esta página no existe.</p>
      <Link to="/">Ir a la clasificación</Link>
    </main>
  )
}

function Page({ path }) {
  if (path === '/' || path === '') return <Home tab="clasificacion" />
  if (path === '/ranking') return <Home tab="ranking" />
  if (path === '/torneos') return <Home tab="torneos" />
  const t = match('/torneo/:id', path)
  if (t) return <Tournament key={t.id} id={t.id} />
  if (path === '/admin' || path.startsWith('/admin/'))
    return (
      <Suspense fallback={<p className="wrap status">Cargando…</p>}>
        <Admin path={path} />
      </Suspense>
    )
  return <NotFound />
}

export default function App() {
  const path = usePath().replace(/\/+$/, '') || '/'
  const admin = path.startsWith('/admin')
  return (
    <>
      <DemoBanner />
      <Header admin={admin} />
      <Page path={path} />
      <footer className="wrap foot">
        <p>
          Orden de Mérito del{' '}
          <a href="https://clubmartiartu.com/golf/" rel="noopener">
            Club Deportivo Martiartu
          </a>
          .
        </p>
        {!admin && (
          <p>
            <Link to="/admin" className="foot-admin">
              Administración
            </Link>
          </p>
        )}
      </footer>
    </>
  )
}
