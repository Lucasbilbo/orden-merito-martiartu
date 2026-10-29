// Lectura de resultados pegados (desde Excel, un CSV o copiados de un PDF) y emparejado con jugadores.
import { normalize } from './format.js'

const NUM = /^[+-]?\d+(?:[.,]\d+)?$/
const isNum = (s) => NUM.test(String(s).trim())
const toNum = (s) => {
  const t = String(s ?? '').trim()
  if (!t || t === '-' || t === '–') return ''
  return isNum(t) ? Number(t.replace(',', '.')) : NaN
}

const HEADERS = {
  name: /^(jugador(es)?|nombre( y apellidos| completo)?|apellidos y nombre|participante)$/,
  first: /^(nombre)$/,
  last: /^(apellidos?|apellido ?1|primer apellido)$/,
  last2: /^(apellido ?2|segundo apellido)$/,
  stableford: /^(stableford|stb|sf|neto|puntos stableford|pts stableford)$/,
  scratch: /^(scratch|scr|sc|bruto|puntos scratch|pts scratch)$/,
  hcp: /^(hcp|hdcp|h[aá]ndicap|handicap|hcp exacto|hcp juego|exacto)$/,
  pos_stableford: /^(puesto stableford|pos stableford|pos sf|puesto sf|pos_stableford)$/,
  pos_scratch: /^(puesto scratch|pos scratch|pos sc|puesto sc|pos_scratch)$/,
}

function headerMap(fields) {
  const map = {}
  fields.forEach((f, i) => {
    const n = normalize(f).replace(/[.:]/g, '')
    for (const [k, re] of Object.entries(HEADERS)) if (re.test(n) && map[k] === undefined) map[k] = i
  })
  // "nombre" + "apellidos" en columnas separadas: "nombre" es solo el nombre de pila.
  if (map.last !== undefined && map.name === map.first) delete map.name
  else if (map.name !== undefined) delete map.first
  const hits = Object.keys(map).length
  return hits >= 2 && (map.name !== undefined || map.first !== undefined || map.last !== undefined) ? map : null
}

// "ETXEBERRIA GARAI, IÑAKI" -> "IÑAKI ETXEBERRIA GARAI"
function fixName(raw) {
  let s = String(raw).replace(/\s+/g, ' ').trim()
  const m = s.match(/^([^,]+),\s*(.+)$/)
  if (m) s = `${m[2]} ${m[1]}`
  return s
}

export function titleCase(s) {
  if (s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (['de', 'del', 'la', 'y'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// Devuelve { rows: [{ line, name, stableford, scratch, hcp, pos_stableford, pos_scratch, error }], mode }
export function parsePasted(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean)
  if (!lines.length) return { rows: [], mode: null }

  let sep = null
  if (lines.some((l) => l.includes('\t'))) sep = '\t'
  else if (lines.some((l) => l.includes(';'))) sep = ';'
  else if (lines.every((l) => l.split(',').length >= 3)) {
    // Coma como separador solo si hay cabecera o el segundo campo es un número.
    const first = lines[0].split(',')
    if (headerMap(first) || lines.slice(1).every((l) => isNum(l.split(',')[1]))) sep = ','
  }

  const out = []
  let map = null
  let start = 0
  if (sep) {
    map = headerMap(lines[0].split(sep))
    if (map) start = 1
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    let name = ''
    let nums = []
    let given = {}
    if (sep && map) {
      const f = line.split(sep).map((x) => x.trim())
      const get = (k) => (map[k] !== undefined ? f[map[k]] ?? '' : '')
      name = map.name !== undefined ? get('name') : [get('first'), get('last'), get('last2')].filter(Boolean).join(' ')
      given = {
        stableford: toNum(get('stableford')),
        scratch: toNum(get('scratch')),
        hcp: toNum(get('hcp')),
        pos_stableford: toNum(get('pos_stableford')),
        pos_scratch: toNum(get('pos_scratch')),
      }
    } else {
      // Sin cabecera: el nombre son los campos de texto; los números que van detrás son Stableford, Scratch y hándicap.
      // Los números que van delante del nombre (puesto) se ignoran: el puesto se recalcula.
      const f = sep ? line.split(sep).map((x) => x.trim()) : line.split(/\s+/)
      let k = 0
      while (k < f.length && (isNum(f[k]) || /^[tT]?\d+º?\.?$/.test(f[k]) || f[k] === '')) k++
      if (sep) {
        // Columnas fijas: [nombre (una o varias columnas)] + Stableford + Scratch + hándicap.
        const rest = f.slice(k)
        const nameCols = rest.length >= 4 ? rest.length - 3 : 1
        name = rest.slice(0, nameCols).filter(Boolean).join(' ')
        nums = rest.slice(nameCols)
      } else {
        const nameParts = []
        while (k < f.length && !isNum(f[k]) && f[k] !== '-' && f[k] !== '–') nameParts.push(f[k++])
        name = nameParts.join(' ')
        nums = f.slice(k).filter((x) => x !== '')
      }
      given = { stableford: toNum(nums[0]), scratch: toNum(nums[1]), hcp: toNum(nums[2]), pos_stableford: '', pos_scratch: '' }
    }
    name = fixName(name)
    const row = { line: i + 1, name, ...given }
    const errs = []
    if (!name) errs.push('sin nombre')
    for (const k of ['stableford', 'scratch']) {
      if (Number.isNaN(row[k]) || (row[k] !== '' && (!Number.isInteger(row[k]) || row[k] < 0 || row[k] > 80))) {
        errs.push(`${k} no válido`)
      }
    }
    if (Number.isNaN(row.hcp) || (row.hcp !== '' && (row.hcp < -10 || row.hcp > 54))) errs.push('hándicap no válido')
    for (const k of ['pos_stableford', 'pos_scratch']) if (Number.isNaN(row[k])) row[k] = ''
    if (row.stableford === '' && row.scratch === '') errs.push('sin puntos')
    if (errs.length) row.error = errs.join(', ')
    out.push(row)
  }
  return { rows: out, mode: sep ? (map ? 'cabecera' : 'columnas') : 'texto' }
}

// Nombres equivalentes habituales en los listados de los campos.
const ALIAS = { fco: 'francisco', fran: 'francisco', xavi: 'xabier', xabi: 'xabier', javi: 'javier', jj: 'juanjo', inigo: 'inigo', ma: '' }
const tokens = (s) =>
  normalize(s)
    .replace(/m[ªa]\b/g, ' ')
    .replace(/tx/g, 'ch')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .map((t) => (t in ALIAS ? ALIAS[t] : t))
    .filter((t) => t.length > 1 && !['de', 'del', 'la', 'las', 'los', 'y'].includes(t))

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

// Parecido entre dos palabras: igual 1; una empieza por la otra (nombres cortados en los PDF) 0,9;
// una o dos letras distintas en palabras largas (erratas) 0,8.
function tokenSim(a, b) {
  if (a === b) return 1
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 3 && l.startsWith(s)) return 0.9
  if (s.length >= 5 && lev(a, b) <= (s.length >= 7 ? 2 : 1)) return 0.8
  return 0
}

const bestSim = (t, list) => Math.max(0, ...list.map((o) => tokenSim(t, o)))

// Empareja un nombre con la lista de jugadores. Devuelve { player_id, candidates: [{ id, score }] }.
// Solo se asigna automáticamente si hay un único candidato claro.
export function matchName(name, players) {
  const a = tokens(name)
  if (!a.length) return { player_id: null, candidates: [] }
  const scored = players
    .map((p) => {
      const b = tokens([p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' '))
      if (!b.length) return { id: p.id, score: 0 }
      const simA = a.reduce((s, t) => s + bestSim(t, b), 0) / a.length
      const simB = b.reduce((s, t) => s + bestSim(t, a), 0) / b.length
      // Simétrico: vale tanto si el PDF trae una palabra de más (segundo apellido que la base no tiene)
      // como si la base tiene una que el PDF no trae.
      return { id: p.id, score: Math.round(100 * Math.max(0.6 * simA + 0.4 * simB, 0.4 * simA + 0.6 * simB)) }
    })
    .filter((x) => x.score >= 40)
    .sort((x, y) => y.score - x.score)
  const best = scored[0]
  const clear = best && best.score >= 85 && (!scored[1] || scored[1].score <= best.score - 10)
  return { player_id: clear ? best.id : null, candidates: scored.slice(0, 4) }
}

// "Iñaki Etxeberria Garai" -> { nombre: 'Iñaki', apellido1: 'Etxeberria', apellido2: 'Garai' }
export function splitName(name) {
  const parts = titleCase(fixName(name)).split(' ').filter(Boolean)
  if (parts.length <= 1) return { nombre: parts[0] || '', apellido1: '', apellido2: '' }
  if (parts.length === 2) return { nombre: parts[0], apellido1: parts[1], apellido2: '' }
  return { nombre: parts[0], apellido1: parts[1], apellido2: parts.slice(2).join(' ') }
}
