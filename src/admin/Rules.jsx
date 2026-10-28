import { useState } from 'react'
import api from '../data/api.js'
import { invalidateSite, useSite } from '../data/site.js'
import { Link } from '../router.jsx'
import { formatDate } from '../lib/format.js'
import { Status } from '../components/ui.jsx'

const LABELS = {
  Puestos_Puntuables: 'Puestos que puntúan en el ranking (+1)',
  semanas_exentas: 'Semanas en que un torneo cuenta entero',
  semanas_reducciones: 'Semanas en que va perdiendo valor',
}

function ParamRow({ name, current, history }) {
  const [value, setValue] = useState(current.value)
  const [msg, setMsg] = useState(null)
  const save = async (e) => {
    e.preventDefault()
    try {
      await api.setParam(name, value, current.description)
      invalidateSite()
      setMsg('Guardado. Se aplica desde hoy; el valor anterior queda en el historial.')
    } catch (err) {
      setMsg(`No se ha podido guardar: ${err.message}`)
    }
  }
  return (
    <form className="form inline-form card" onSubmit={save}>
      <label>
        <span>{LABELS[name] || name}</span>
        <input type="number" min="0" max="999" required value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn" type="submit" disabled={Number(value) === Number(current.value)}>
        Guardar
      </button>
      {current.description && <p className="hint">{current.description}</p>}
      {history.length > 1 && (
        <p className="hint">
          Historial: {history.map((h) => `${h.value} desde ${formatDate(h.valid_from)}`).join(' · ')}
        </p>
      )}
      {msg && <p className="form-msg">{msg}</p>}
    </form>
  )
}

export default function Rules() {
  const site = useSite()
  return (
    <>
      <h1 className="admin-h">Reglas</h1>
      <p className="lead">
        Las reglas de la clasificación de cada temporada (cuántos resultados cuentan y cuánto vale la final) están en{' '}
        <Link to="/admin">Torneos</Link>, junto a cada temporada. Aquí están los parámetros del ranking histórico.
      </p>
      <Status state={site}>
        {site.data &&
          Object.keys(LABELS).map((name) => {
            const history = site.data.params.filter((p) => p.name === name).sort((a, b) => b.valid_from.localeCompare(a.valid_from))
            if (!history.length) return null
            return <ParamRow key={`${name}-${history[0].valid_from}-${history[0].value}`} name={name} current={history[0]} history={history} />
          })}
      </Status>
      <section className="card">
        <h2 className="admin-h2">Cómo se calculan los puntos</h2>
        <ul className="plain">
          <li>
            <strong>Puntos de cada torneo:</strong> los Stableford y Scratch que da el campo. Se meten tal cual en Resultados.
          </li>
          <li>
            <strong>Puesto en el torneo:</strong> más puntos primero; a igualdad, hándicap más bajo; si también empatan,
            comparten puesto. Se puede poner a mano si el club da otro orden.
          </li>
          <li>
            <strong>Clasificación de la temporada:</strong> mejores N resultados + final × multiplicador. Empate: hándicap más
            bajo (el de la final o, si no, el último de la temporada).
          </li>
          <li>
            <strong>Ranking histórico:</strong> puntos por puesto × coeficiente del torneo, con pérdida de valor por antigüedad.
          </li>
        </ul>
      </section>
    </>
  )
}
