// Reglas de inscripción en JavaScript. Son las mismas que las funciones SQL signup_* de
// supabase/migrations/0003_inscripciones.sql; se usan en el modo demo y para pintar estados.

// Cierre por defecto: el inicio del día del torneo (como en la SQL).
export const closesAt = (t) => t.signup_closes_at || `${t.date}T00:00:00Z`

// 'no_hay' | 'sin_abrir' | 'abierta' | 'cerrada'
export function signupState(t, now = new Date()) {
  if (!t?.signup_opens_at) return 'no_hay'
  if (now < new Date(t.signup_opens_at)) return 'sin_abrir'
  if (now >= new Date(closesAt(t))) return 'cerrada'
  return 'abierta'
}

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE = /^[0-9+ ()-]{6,20}$/

export class SignupError extends Error {}

// Valida y crea una inscripción sobre una lista en memoria. Devuelve la fila nueva.
export function createSignup({ t, signups, players, input, now = new Date(), uuid }) {
  const st = signupState(t, now)
  if (st === 'no_hay' || st === 'sin_abrir') throw new SignupError('La inscripción de este torneo todavía no está abierta')
  if (st === 'cerrada') throw new SignupError('La inscripción de este torneo ya está cerrada')
  const email = input.email ? String(input.email).trim().toLowerCase() : null
  const phone = input.phone ? String(input.phone).trim().replace(/\s+/g, ' ') : null
  if (!email && !phone) throw new SignupError('Deja un correo o un teléfono para poder avisarte')
  if (email && !EMAIL.test(email)) throw new SignupError('El correo no parece válido')
  if (phone && !PHONE.test(phone)) throw new SignupError('El teléfono no parece válido')

  let nombre
  if (input.player_id) {
    const p = players.find((x) => x.id === Number(input.player_id))
    if (!p) throw new SignupError('Jugador no encontrado')
    nombre = [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ')
  } else {
    nombre = String(input.nombre || '').trim().replace(/\s+/g, ' ')
    if (nombre.length < 4 || !nombre.includes(' ')) throw new SignupError('Escribe nombre y apellidos')
  }
  const active = signups.filter((s) => s.tournament_id === t.id && s.status !== 'anulado')
  if (active.some((s) => (input.player_id && s.player_id === Number(input.player_id)) || norm(s.nombre) === norm(nombre))) {
    throw new SignupError(`${nombre} ya está inscrito en este torneo`)
  }
  const inscritos = active.filter((s) => s.status === 'inscrito').length
  const status = t.max_players && inscritos >= t.max_players ? 'reserva' : 'inscrito'
  return {
    id: Math.max(0, ...signups.map((s) => s.id)) + 1,
    tournament_id: t.id,
    player_id: input.player_id ? Number(input.player_id) : null,
    nombre,
    email,
    phone,
    hcp: input.hcp === '' || input.hcp == null ? null : Number(String(input.hcp).replace(',', '.')),
    comment: input.comment ? String(input.comment).trim().slice(0, 300) : null,
    status,
    tee_time: null,
    cancel_token: uuid(),
    created_at: now.toISOString(),
  }
}

// Anula y, si queda plaza, sube al primero de la reserva. Modifica la lista. Devuelve el nombre que sube.
export function cancelSignup({ t, signups, row, now = new Date() }) {
  if (now >= new Date(`${t.date}T00:00:00Z`)) throw new SignupError('El torneo ya ha empezado; avisa al organizador')
  if (row.status === 'anulado') return null
  const was = row.status
  row.status = 'anulado'
  if (was !== 'inscrito') return null
  const inscritos = signups.filter((s) => s.tournament_id === t.id && s.status === 'inscrito').length
  if (t.max_players && inscritos >= t.max_players) return null
  const next = signups
    .filter((s) => s.tournament_id === t.id && s.status === 'reserva')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)[0]
  if (!next) return null
  next.status = 'inscrito'
  return next.nombre
}

// Lista pública (sin contacto), como signup_list().
export function publicList(t, signups) {
  const act = signups.filter((s) => s.tournament_id === t.id && s.status !== 'anulado')
  const byTime = (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id
  const ins = act.filter((s) => s.status === 'inscrito').sort(byTime)
  const res = act.filter((s) => s.status === 'reserva').sort(byTime)
  const out = [
    ...ins.map((s, i) => ({ orden: i + 1, nombre: s.nombre, estado: 'inscrito', horario: t.tee_times_published ? s.tee_time : null })),
    ...res.map((s, i) => ({ orden: i + 1, nombre: s.nombre, estado: 'reserva', horario: null })),
  ]
  if (t.tee_times_published) {
    const k = (x) => (x.estado === 'reserva' ? 'z' : x.horario || 'y')
    out.sort((a, b) => k(a).localeCompare(k(b)))
  }
  return out
}

export function statusSummary(t, signups, now = new Date()) {
  const act = signups.filter((s) => s.tournament_id === t.id)
  return {
    estado: signupState(t, now),
    abre: t.signup_opens_at || null,
    cierra: t.signup_opens_at ? closesAt(t) : null,
    plazas: t.max_players || null,
    inscritos: act.filter((s) => s.status === 'inscrito').length,
    reservas: act.filter((s) => s.status === 'reserva').length,
    notas: t.signup_notes || null,
    horarios: Boolean(t.tee_times_published),
  }
}

// Reparte horarios: desde `start` ("09:00") cada `every` minutos, `per` jugadores por partida.
export function makeTeeTimes(names, { start = '09:00', every = 10, per = 4, hole = '' } = {}) {
  const [h, m] = start.split(':').map(Number)
  return names.map((_, i) => {
    const mins = h * 60 + m + Math.floor(i / per) * every
    const hhmm = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    return hole ? `${hhmm} · ${hole}` : hhmm
  })
}

// Texto para pegar en el grupo de WhatsApp.
export function whatsappText({ t, list, kind, url }) {
  const fecha = new Date(`${t.date}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const title = `*${t.course || t.name}* — ${fecha}`
  const ins = list.filter((x) => x.estado === 'inscrito')
  const res = list.filter((x) => x.estado === 'reserva')
  const lines = []
  if (kind === 'horarios') {
    lines.push(`⛳ Horarios ${title}`, '')
    const groups = new Map()
    for (const x of ins) {
      const k = x.horario || 'Sin horario'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(x.nombre)
    }
    for (const [k, ns] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`*${k}*: ${ns.join(', ')}`)
  } else {
    lines.push(`⛳ Inscritos ${title} (${ins.length})`, '')
    ins.forEach((x, i) => lines.push(`${i + 1}. ${x.nombre}`))
    if (res.length) {
      lines.push('', `Reserva (${res.length}):`)
      res.forEach((x, i) => lines.push(`${i + 1}. ${x.nombre}`))
    }
  }
  if (url) lines.push('', `Inscripción y horarios: ${url}`)
  return lines.join('\n')
}
