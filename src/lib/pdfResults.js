// Lectura de los PDF de resultados que mandan los campos.
// Probado con los listados del programa de gestión que usan Uraburu y Abra del Pas
// ("POS JUGADOR CLUB HEX NVH NIV S Cat Hpu 1ª 2ª 3ª 4ª TOT"). Cada PDF es una clasificación
// (Handicap = Stableford, o Scratch). Del PDF se toma: puesto, nombre, hándicap exacto (HEX) y total.

const DECIMAL = String.raw`[+-]?\d{1,2},\d`

// "URIARTE GARCIA-ECHAVE, XABI" -> "XABI URIARTE GARCIA-ECHAVE"
const flipName = (s) => {
  const m = s.match(/^(.+?)\s*,\s*(.+)$/)
  return (m ? `${m[2]} ${m[1]}` : s).replace(/\s+/g, ' ').trim()
}
const toHcp = (s) => {
  if (!s) return ''
  const v = Number(s.replace(',', '.').replace('+', '-'))
  return Number.isFinite(v) ? v : ''
}

// Una línea de jugador: [puesto] APELLIDOS, NOMBRE   CLUB   HEX [NVH] ... resto
const ROW = new RegExp(
  String.raw`^\s*(?:(?<pos>\d{1,3})\s+)?(?<name>[^\d\s,][^,]*?\s*,\s*\S.*?)\s{2,}(?<club>\S.*?)\s+(?<hex>${DECIMAL})(?:\s+(?<nvh>${DECIMAL}))?\s+(?<rest>.*)$`,
)

export function guessModality(title, fileName = '') {
  const t = `${title}`.toLowerCase()
  if (/scratch/.test(t)) return 'scratch'
  if (/h(andi)?ca?p|hcp/.test(t)) return 'stableford'
  const f = fileName.toLowerCase()
  if (/scratch|scdm|[_-]s\.pdf$/.test(f)) return 'scratch'
  if (/hcp|handicap|hcdm|stableford/.test(f)) return 'stableford'
  return null
}

// lines: líneas de texto del PDF con los huecos de columna como 2+ espacios.
export function parseResultSheet(lines, fileName = '') {
  const sheet = { fileName, course: '', date: '', title: '', modality: null, rows: [], skipped: [], unread: [] }
  let headerIdx = lines.findIndex((l) => /\bPOS\b.*\bJUGADOR\b/i.test(l))
  const firstText = lines.find((l) => l.trim() && !/Listado/i.test(l.split(/\s{2,}/).filter(Boolean)[0] || ''))
  if (firstText) sheet.course = firstText.trim().split(/\s{2,}/)[0]
  for (const l of lines) {
    const d = l.match(/FECHA:\s*(\d{2})\/(\d{2})\/(\d{4})/)
    if (d) {
      sheet.date = `${d[3]}-${d[2]}-${d[1]}`
      break
    }
  }
  if (headerIdx > 0) {
    const t = lines.slice(0, headerIdx).reverse().find((l) => l.trim())
    sheet.title = (t || '').replace(/\(ASC:.*?\)/i, '').replace(/\d+ª\s*Vuelta/i, '').trim()
  }
  sheet.modality = guessModality(sheet.title, fileName)

  let lastPos = null
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue
    const m = line.match(ROW)
    if (!m) {
      if (/,/.test(line) && /\d/.test(line)) sheet.unread.push(line.trim())
      continue
    }
    const { pos, name, club, hex, rest } = m.groups
    if (pos) lastPos = Number(pos)
    const tokens = rest.trim().split(/\s+/)
    const last = tokens[tokens.length - 1]
    const row = { name: flipName(name), club: club.trim(), hcp: toHcp(hex), position: lastPos }
    if (!/^\d+$/.test(last)) {
      sheet.skipped.push({ ...row, status: last }) // N.P (no presentado), Ret (retirado), Desc...
      continue
    }
    sheet.rows.push({ ...row, points: Number(last) })
  }
  return sheet
}

// Si un PDF no dice su modalidad y hay otro que sí, es la contraria; si no, la de puntos más bajos es Scratch.
export function resolveModalities(sheets) {
  const known = sheets.filter((s) => s.modality)
  for (const s of sheets) {
    if (s.modality) continue
    if (sheets.length === 2 && known.length === 1) s.modality = known[0].modality === 'scratch' ? 'stableford' : 'scratch'
    else {
      const avg = s.rows.reduce((a, r) => a + r.points, 0) / (s.rows.length || 1)
      s.modality = avg < 22 ? 'scratch' : 'stableford'
      s.guessed = true
    }
  }
  return sheets
}

// --- Extracción en el navegador con pdf.js ---
// Reconstruye las líneas a partir de la posición de cada trozo de texto.
export function itemsToLines(items) {
  const rows = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    const w = it.width || it.str.length * 4
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, w, str: it.str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x)
    let out = ''
    let end = null
    for (const p of r.parts) {
      const charW = p.w / Math.max(1, p.str.length)
      if (end !== null) {
        const gap = p.x - end
        out += gap > charW * 1.8 ? '   ' : gap > charW * 0.25 ? ' ' : ''
      }
      out += p.str
      end = p.x + p.w
    }
    return out
  })
}

export async function extractPdfLines(data) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  }
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const lines = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    lines.push(...itemsToLines(content.items))
  }
  return lines
}

export async function readResultPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const lines = await extractPdfLines(data)
  const sheet = parseResultSheet(lines, file.name)
  return sheet
}
