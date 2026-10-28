import { useEffect, useMemo, useState } from 'react'
import api from '../data/api.js'
import { invalidateSite, useSite } from '../data/site.js'
import { Link } from '../router.jsx'
import { formatDate, fullName, normalize } from '../lib/format.js'
import { matchName, parsePasted, splitName } from '../lib/paste.js'
import { tournamentResults } from '../lib/standings.js'
import { useAsync } from '../lib/useAsync.js'
import { Status } from '../components/ui.jsx'

let keySeq = 0
const newKey = () => `r${++keySeq}`
const EMPTY = { stableford: '', scratch: '', hcp: '', pos_stableford: '', pos_scratch: '' }
const NEW = 'new'
const SKIP = 'skip' // no es de la Orden: no se guarda

// Una fila del editor. choice: id de jugador, 'new' (crear), 'skip' (no incluir) o '' (sin decidir).
function rowFromEntry(e, players) {
  const p = players.find((x) => x.id === e.player_id)
  return { key: newKey(), ...EMPTY, ...e, choice: String(e.player_id), name: fullName(p), candidates: [], newPlayer: null }
}

function rowFromPasted(r, players, unknown = NEW) {
  const m = matchName(r.name, players)
  const choice = m.player_id ? String(m.player_id) : m.candidates.some((c) => c.score >= 50) ? '' : unknown
  return {
    key: newKey(),
    ...EMPTY,
    stableford: r.stableford,
    scratch: r.scratch,
    hcp: r.hcp,
    pos_stableford: r.pos_stableford,
    pos_scratch: r.pos_scratch,
    choice,
    name: r.name,
    candidates: m.candidates,
    newPlayer: splitName(r.name),
    error: r.error,
  }
}

const num = (v) => (v === '' || v == null ? '' : Number(String(v).replace(',', '.')))

function validate(rows) {
  const problems = []
  const seen = new Map()
  rows.forEach((r, i) => {
    const n = i + 1
    if (r.choice === SKIP) return
    if (r.error) problems.push(`Fila ${n}: ${r.error}.`)
    if (!r.choice) problems.push(`Fila ${n} (${r.name || 'sin nombre'}): elige el jugador o crea uno nuevo.`)
    if (r.choice === NEW && !r.newPlayer?.nombre?.trim()) problems.push(`Fila ${n}: el jugador nuevo necesita nombre.`)
    if (r.choice && r.choice !== NEW && r.choice !== SKIP) {
      if (seen.has(r.choice)) problems.push(`Filas ${seen.get(r.choice)} y ${n}: el mismo jugador está dos veces.`)
      seen.set(r.choice, n)
    }
    const sf = num(r.stableford)
    const sc = num(r.scratch)
    const h = num(r.hcp)
    if (sf === '' && sc === '') problems.push(`Fila ${n}: faltan los puntos.`)
    for (const [v, label] of [
      [sf, 'Stableford'],
      [sc, 'Scratch'],
    ])
      if (v !== '' && (!Number.isInteger(v) || v < 0 || v > 80)) problems.push(`Fila ${n}: ${label} no válido.`)
    if (h !== '' && (Number.isNaN(h) || h < -10 || h > 54)) problems.push(`Fila ${n}: hándicap no válido.`)
  })
  return problems
}

function PlayerCell({ row, players, onChange }) {
  const byScore = row.candidates.filter((c) => c.score >= 50).map((c) => players.find((p) => p.id === c.id)).filter(Boolean)
  const decided = row.choice && row.choice !== NEW && row.choice !== SKIP
  return (
    <div className={`player-cell${!row.choice ? ' needs' : ''}`}>
      {row.name && (!decided || normalize(row.name) !== normalize(fullName(players.find((p) => String(p.id) === row.choice)))) && (
        <span className="pasted-name">{row.name}</span>
      )}
      <select
        aria-label="Jugador"
        value={row.choice}
        onChange={(e) => onChange({ choice: e.target.value, newPlayer: row.newPlayer || splitName(row.name || '') })}
      >
        <option value="">Elige jugador…</option>
        {byScore.length > 0 && (
          <optgroup label="Parecidos">
            {byScore.map((p) => (
              <option key={`c${p.id}`} value={String(p.id)}>
                {fullName(p)}
              </option>
            ))}
          </optgroup>
        )}
        <option value={NEW}>+ Crear jugador nuevo</option>
        <option value={SKIP}>No es de la Orden (no incluir)</option>
        <optgroup label="Todos">
          {players.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {fullName(p)}
            </option>
          ))}
        </optgroup>
      </select>
      {row.choice === NEW && (
        <div className="new-player">
          {['nombre', 'apellido1', 'apellido2'].map((k) => (
            <input
              key={k}
              aria-label={k === 'nombre' ? 'Nombre' : k === 'apellido1' ? 'Primer apellido' : 'Segundo apellido'}
              placeholder={k === 'nombre' ? 'Nombre' : k === 'apellido1' ? '1er apellido' : '2º apellido'}
              value={row.newPlayer?.[k] || ''}
              onChange={(e) => onChange({ newPlayer: { ...row.newPlayer, [k]: e.target.value } })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Results({ id }) {
  const site = useSite()
  const playersState = useAsync(() => api.adminGetPlayers(), [])
  const entriesState = useAsync(() => api.getTournamentEntries(id), [id])
  const [rows, setRows] = useState(null)
  const [paste, setPaste] = useState('')
  const [pasteInfo, setPasteInfo] = useState(null)
  const [manualPos, setManualPos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [pdfInfo, setPdfInfo] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const players = useMemo(
    () => [...(playersState.data || [])].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es')),
    [playersState.data],
  )
  const t = site.data?.tournaments.find((x) => x.id === id)

  useEffect(() => {
    if (rows === null && entriesState.data && playersState.data) {
      const list = entriesState.data.map((e) => rowFromEntry(e, playersState.data))
      setRows(list.sort((a, b) => (num(b.stableford) || 0) - (num(a.stableford) || 0)))
      setManualPos(false)
    }
  }, [entriesState.data, playersState.data, rows])

  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (key, patch) => {
    setDirty(true)
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, error: patch.error ?? (patch.stableford !== undefined || patch.scratch !== undefined || patch.hcp !== undefined ? null : r.error) } : r)))
  }

  const readPaste = (mode) => {
    const { rows: parsed, mode: how } = parsePasted(paste)
    if (!parsed.length) return setPasteInfo('No he encontrado filas en el texto pegado.')
    const fresh = parsed.map((r) => rowFromPasted(r, players))
    setRows((rs) => (mode === 'replace' ? fresh : [...(rs || []), ...fresh]))
    setDirty(true)
    setPaste('')
    const auto = fresh.filter((r) => r.choice && r.choice !== NEW).length
    const nuevos = fresh.filter((r) => r.choice === NEW).length
    const dudas = fresh.filter((r) => !r.choice).length
    const errores = fresh.filter((r) => r.error).length
    setPasteInfo(
      `${fresh.length} filas leídas (formato: ${how}). ${auto} reconocidas, ${nuevos} jugadores nuevos` +
        (dudas ? `, ${dudas} por confirmar (en amarillo)` : '') +
        (errores ? `, ${errores} con errores` : '') +
        '.',
    )
  }

  // Importa 1 o 2 PDF del campo (clasificación Handicap = Stableford y Scratch) y rellena la tabla.
  const importPdfs = async (files) => {
    if (!files.length) return
    if (rows?.length && !window.confirm('¿Sustituir la tabla actual por los resultados de los PDF? (Lo guardado no cambia hasta que pulses Guardar.)')) return
    setPdfBusy(true)
    setPdfInfo(null)
    try {
      const { readResultPdf, resolveModalities } = await import('../lib/pdfResults.js')
      const sheets = resolveModalities(await Promise.all(files.map((f) => readResultPdf(f))))
      const byName = new Map()
      for (const sh of sheets) {
        for (const r of sh.rows) {
          const k = normalize(r.name)
          if (!byName.has(k)) byName.set(k, { name: r.name, stableford: '', scratch: '', hcp: r.hcp, pos_stableford: '', pos_scratch: '' })
          const e = byName.get(k)
          e[sh.modality] = r.points
          if (e.hcp === '') e.hcp = r.hcp
        }
      }
      const fresh = [...byName.values()].map((r) => rowFromPasted(r, players, SKIP))
      fresh.sort((a, b) => (num(b.stableford) || 0) - (num(a.stableford) || 0))

      // Diferencias con lo guardado
      const prev = new Map((entriesState.data || []).map((e) => [String(e.player_id), e]))
      const diffs = []
      for (const r of fresh) {
        const e = prev.get(r.choice)
        if (!e) continue
        for (const m of ['stableford', 'scratch']) {
          if (r[m] !== '' && e[m] !== '' && Number(r[m]) !== Number(e[m])) diffs.push(`${fullName(players.find((p) => String(p.id) === r.choice))}: ${m} ${e[m]} → ${r[m]}`)
        }
      }
      const chosen = new Set(fresh.map((r) => r.choice))
      const missing = [...prev.keys()].filter((id) => !chosen.has(id)).map((id) => fullName(players.find((p) => String(p.id) === id)))

      const lines = sheets.map((sh) => {
        const mod = sh.modality === 'scratch' ? 'Scratch' : 'Stableford'
        const parts = [`${sh.fileName}: ${mod}${sh.guessed ? ' (supuesto)' : ''}, ${sh.rows.length} jugadores`]
        if (sh.skipped.length) parts.push(`${sh.skipped.length} sin resultado (${sh.skipped.map((x) => x.status).join(', ')})`)
        if (sh.unread.length) parts.push(`${sh.unread.length} líneas sin leer`)
        if (sh.date && t && sh.date !== t.date) parts.push(`OJO: el PDF es del ${formatDate(sh.date)}`)
        return parts.join(' · ')
      })
      if (!sheets.some((sh) => sh.rows.length)) throw new Error('No he encontrado resultados en el PDF. Prueba a copiar y pegar el texto.')
      const mods = new Set(sheets.map((sh) => sh.modality))
      if (mods.size < sheets.length) lines.push('Hay dos PDF de la misma modalidad: revisa cuál es Stableford y cuál Scratch.')
      const skipped = fresh.filter((r) => r.choice === SKIP).length
      const doubt = fresh.filter((r) => !r.choice).length
      lines.push(
        `${fresh.length - skipped - doubt} jugadores reconocidos` +
          (doubt ? `, ${doubt} por confirmar (amarillo)` : '') +
          (skipped ? `, ${skipped} que no están en la Orden (en gris; cámbialos si sí lo están)` : '') +
          '.',
      )
      setRows(fresh)
      setDirty(true)
      setManualPos(false)
      setPdfInfo({ lines, diffs, missing })
    } catch (err) {
      setPdfInfo({ error: err.message || 'No se ha podido leer el PDF.' })
    } finally {
      setPdfBusy(false)
    }
  }

  // Vista previa de puestos con la misma lógica que la base de datos.
  const preview = useMemo(() => {
    if (!rows) return {}
    const input = rows.filter((r) => r.choice !== SKIP).map((r) => ({
      player_id: r.key,
      stableford: num(r.stableford),
      scratch: num(r.scratch),
      hcp: num(r.hcp),
      pos_stableford: manualPos ? num(r.pos_stableford) : '',
      pos_scratch: manualPos ? num(r.pos_scratch) : '',
    }))
    const out = {}
    for (const res of tournamentResults(0, input)) {
      out[res.player_id] = { ...out[res.player_id], [res.modality]: res.position }
    }
    return out
  }, [rows, manualPos])

  const problems = rows ? validate(rows) : []

  const save = async () => {
    setMsg(null)
    if (problems.length) return setMsg({ error: true, text: 'Revisa los avisos antes de guardar.' })
    setSaving(true)
    const created = {}
    try {
      const finalRows = []
      for (const r of rows.filter((x) => x.choice !== SKIP)) {
        let playerId = Number(r.choice)
        if (r.choice === NEW) {
          playerId = await api.createPlayer({ ...r.newPlayer, handicap: num(r.hcp) })
          created[r.key] = playerId
        }
        finalRows.push({
          player_id: playerId,
          stableford: num(r.stableford),
          scratch: num(r.scratch),
          hcp: num(r.hcp),
          pos_stableford: manualPos ? num(r.pos_stableford) : '',
          pos_scratch: manualPos ? num(r.pos_scratch) : '',
        })
      }
      const res = await api.saveTournamentResults(id, finalRows)
      invalidateSite()
      setDirty(false)
      setRows(null)
      playersState.reload()
      entriesState.reload()
      setMsg({ text: `Guardado: ${res.stableford} resultados Stableford y ${res.scratch} Scratch. La clasificación ya está actualizada.` })
    } catch (err) {
      // Los jugadores ya creados quedan asignados para no duplicarlos al reintentar.
      if (Object.keys(created).length) {
        playersState.reload()
        setRows((rs) => rs.map((r) => (created[r.key] ? { ...r, choice: String(created[r.key]) } : r)))
      }
      setMsg({ error: true, text: `No se ha podido guardar: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const state = {
    loading: site.loading || playersState.loading || entriesState.loading,
    error: site.error || playersState.error || entriesState.error,
    data: true,
  }

  return (
    <Status state={state}>
      {site.data && !t && <p className="status">Este torneo no existe.</p>}
      {t && (
        <>
          <p className="crumb">
            <Link to="/admin">‹ Torneos</Link>
          </p>
          <h1 className="admin-h">
            {t.course || t.name}
            {t.is_final && <span className="badge"> Final</span>}
          </h1>
          <p className="lead">
            {formatDate(t.date)} · <Link to={`/torneo/${t.id}`}>ver página pública</Link>
          </p>

          <section className="card paste">
            <h2 className="admin-h2">Importar PDF del campo</h2>
            <p className="hint">
              Sube a la vez la clasificación Handicap (Stableford) y la Scratch que manda el campo. Se leen nombre, puntos y
              hándicap exacto (HEX); los no presentados y retirados se descartan. Revisa la tabla y pulsa Guardar.
            </p>
            <label className="btn primary file-btn">
              {pdfBusy ? 'Leyendo…' : 'Elegir PDF'}
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={pdfBusy}
                onChange={(e) => {
                  const picked = [...e.target.files]
                  e.target.value = ''
                  importPdfs(picked)
                }}
              />
            </label>
            {pdfInfo?.error && (
              <p className="form-error" role="alert">
                {pdfInfo.error}
              </p>
            )}
            {pdfInfo?.lines && (
              <div className="pdf-info" role="status">
                {pdfInfo.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                {pdfInfo.diffs.length > 0 && (
                  <details open>
                    <summary>{pdfInfo.diffs.length} diferencias con lo que ya estaba guardado</summary>
                    <ul>
                      {pdfInfo.diffs.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {pdfInfo.missing.length > 0 && (
                  <p>Estaban guardados y no salen en el PDF: {pdfInfo.missing.join(', ')}.</p>
                )}
              </div>
            )}
          </section>

          <section className="card paste">
            <h2 className="admin-h2">Pegar resultados</h2>
            <p className="hint">
              Copia desde Excel, un CSV o el PDF del club. Una fila por jugador:{' '}
              <code>Nombre y apellidos; Stableford; Scratch; Hándicap</code>. Si pegas con cabecera (Jugador, Stableford,
              Scratch, Hcp…) da igual el orden de las columnas. El puesto no hace falta: se calcula solo entre los jugadores de la Orden.
            </p>
            <textarea
              rows={6}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Jugador;Stableford;Scratch;Hcp\nIñaki Etxeberria Garai;38;30;6,1\nAne Zubizarreta Olano;35;22;15,4'}
              aria-label="Resultados pegados"
              spellCheck={false}
            />
            <div className="form-actions">
              <button className="btn primary" type="button" disabled={!paste.trim()} onClick={() => readPaste(rows?.length ? 'append' : 'replace')}>
                {rows?.length ? 'Añadir a la tabla' : 'Leer'}
              </button>
              {rows?.length > 0 && (
                <button
                  className="btn"
                  type="button"
                  disabled={!paste.trim()}
                  onClick={() => window.confirm('¿Sustituir todas las filas de la tabla por lo pegado?') && readPaste('replace')}
                >
                  Sustituir tabla
                </button>
              )}
            </div>
            {pasteInfo && (
              <p className="form-msg" role="status">
                {pasteInfo}
              </p>
            )}
          </section>

          <section>
            <div className="table-head">
              <h2 className="admin-h2">Resultados ({rows?.filter((r) => r.choice !== SKIP).length || 0})</h2>
              <label className="check small">
                <input type="checkbox" checked={manualPos} onChange={(e) => setManualPos(e.target.checked)} />
                <span>Puestos a mano</span>
              </label>
            </div>
            <div className="edit-scroll">
              <table className="edit">
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Stb</th>
                    <th>Scr</th>
                    <th>Hcp</th>
                    <th title="Puesto Stableford / Scratch">Puesto</th>
                    <th aria-label="Quitar" />
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).map((r) => (
                    <tr key={r.key} className={r.choice === SKIP ? 'skipped' : r.error ? 'has-error' : !r.choice ? 'needs' : undefined}>
                      <td>
                        <PlayerCell row={r} players={players} onChange={(p) => update(r.key, p)} />
                        {r.error && <span className="row-error">{r.error}</span>}
                      </td>
                      {['stableford', 'scratch', 'hcp'].map((k) => (
                        <td key={k} className="num">
                          <input
                            inputMode={k === 'hcp' ? 'decimal' : 'numeric'}
                            aria-label={k}
                            value={r[k] ?? ''}
                            onChange={(e) => update(r.key, { [k]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="pos">
                        {manualPos ? (
                          <span className="pos-inputs">
                            <input inputMode="numeric" aria-label="Puesto Stableford" placeholder={preview[r.key]?.stableford ?? ''} value={r.pos_stableford ?? ''} onChange={(e) => update(r.key, { pos_stableford: e.target.value })} />
                            <input inputMode="numeric" aria-label="Puesto Scratch" placeholder={preview[r.key]?.scratch ?? ''} value={r.pos_scratch ?? ''} onChange={(e) => update(r.key, { pos_scratch: e.target.value })} />
                          </span>
                        ) : (
                          <span className="pos-preview">
                            {preview[r.key]?.stableford ?? '–'}
                            <small> / {preview[r.key]?.scratch ?? '–'}</small>
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Quitar ${r.name || 'fila'}`}
                          onClick={() => {
                            setDirty(true)
                            setRows((rs) => rs.filter((x) => x.key !== r.key))
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setDirty(true)
                setRows((rs) => [...(rs || []), { key: newKey(), ...EMPTY, choice: '', name: '', candidates: [], newPlayer: null }])
              }}
            >
              Añadir fila
            </button>
          </section>

          {problems.length > 0 && (
            <ul className="problems" role="alert">
              {problems.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
              {problems.length > 8 && <li>… y {problems.length - 8} avisos más.</li>}
            </ul>
          )}

          <div className="save-bar">
            <button className="btn primary big" type="button" onClick={save} disabled={saving || !rows || !dirty}>
              {saving ? 'Guardando…' : dirty ? 'Guardar resultados' : 'Sin cambios'}
            </button>
            {msg && (
              <p className={msg.error ? 'form-error' : 'form-msg'} role="status">
                {msg.text}
              </p>
            )}
          </div>
        </>
      )}
    </Status>
  )
}
