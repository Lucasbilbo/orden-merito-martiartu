// Datos de prueba realistas para el modo demo (?demo=1). Son inventados y deterministas:
// 40 jugadores, temporada 2027 con 8 torneos + final, 4 torneos ya jugados.
// Nunca se escriben en la base real.
import { seasonBoard, tournamentResults } from '../lib/standings.js'

export const DEMO_SEASON = 2027

function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = [
  ['Iñaki', 'Etxeberria', 'Garai'], ['Ane', 'Zubizarreta', 'Olano'], ['Jon', 'Arrieta', 'Uribe'],
  ['Mikel', 'Goikoetxea', 'Lasa'], ['Itziar', 'Aguirre', 'Bilbao'], ['Unai', 'Larrañaga', 'Ibarra'],
  ['Asier', 'Mendizabal', 'Otxoa'], ['Leire', 'Ugarte', 'Salaberria'], ['Gorka', 'Elorza', 'Aranburu'],
  ['Javier', 'Martínez', 'Ruiz'], ['Carlos', 'García', 'López'], ['Begoña', 'Fernández', 'Sáez'],
  ['Koldo', 'Urrutia', 'Basterra'], ['Amaia', 'Iturbe', 'Zabala'], ['Xabier', 'Olabarria', 'Gómez'],
  ['Íñigo', 'Ormaetxea', 'Pérez'], ['Aitor', 'Bengoetxea', 'Alonso'], ['Maite', 'Uriarte', 'Calvo'],
  ['Josu', 'Altuna', 'Eguren'], ['Pablo', 'Sánchez', 'Ortiz'], ['Lucía', 'Herrera', 'Garmendia'],
  ['Ander', 'Azkue', 'Murua'], ['Nerea', 'Loizaga', 'Peña'], ['Fernando', 'Ruiz', 'de Azúa'],
  ['Igor', 'Bilbao', 'Sobrino'], ['Edurne', 'Zorrilla', 'Uranga'], ['Álvaro', 'Díaz', 'Marquina'],
  ['Oier', 'Lekue', 'Basabe'], ['Rosa', 'Moreno', 'Echevarría'], ['Ignacio', 'Prieto', 'Landa'],
  ['Eneko', 'Arana', 'Gorostiza'], ['Garbiñe', 'Txurruka', 'Mata'], ['Luis', 'Romero', 'Ibáñez'],
  ['Ibon', 'Zarate', 'Elejalde'], ['Arantza', 'Gaztelu', 'Vidal'], ['Andoni', 'Isasi', 'Rentería'],
  ['Marta', 'Echániz', 'Gil'], ['Julen', 'Madariaga', 'Ortuzar'], ['Rafael', 'Navarro', 'Ugalde'],
  ['Kepa', 'Arregi', 'Zuazo'],
]

const SCHEDULE = [
  ['2027-02-14', 'Izki'],
  ['2027-03-14', 'La Nivelle'],
  ['2027-04-11', 'Uraburu'],
  ['2027-05-09', 'Meaztegi'],
  ['2027-06-06', 'Abra del Pas'],
  ['2027-06-27', 'Villarías'],
  ['2027-07-11', 'Zuia'],
  ['2027-09-12', 'Llanes'],
  ['2027-10-17', 'Rioja Alta', true],
]
const PLAYED = 4
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function buildDemoData() {
  const rand = rng(20271014)
  const normal = (mean, sd) => {
    const u = 1 - rand()
    const v = rand()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const round1 = (x) => Math.round(x * 10) / 10

  const players = NAMES.map(([nombre, apellido1, apellido2], i) => ({ id: i + 1, nombre, apellido1, apellido2 }))
  const baseHcp = Object.fromEntries(players.map((p) => [p.id, round1(3 + rand() * 25)]))

  const tournaments = SCHEDULE.map(([date, course, isFinal], i) => {
    const m = Number(date.slice(5, 7))
    return {
      id: i + 1,
      name: `OM${MONTHS[m - 1]}${String(DEMO_SEASON).slice(2)}${i === 5 ? '_2' : ''}`,
      date,
      course,
      coeficiente: isFinal ? 100 : 90,
      is_final: Boolean(isFinal),
    }
  })

  // Lo que el club pasa de cada torneo: puntos Stableford, puntos Scratch y handicap del día.
  const entries = {}
  for (const t of tournaments.slice(0, PLAYED)) {
    entries[t.id] = []
    for (const p of players) {
      if (rand() > 0.8) continue
      const hcp = round1(Math.max(0.5, baseHcp[p.id] + normal(0, 0.6)))
      const sf = Math.round(Math.min(44, Math.max(22, normal(33, 4))))
      const sc = Math.max(0, Math.round(sf - hcp * 1.05 + normal(0, 1.5)))
      entries[t.id].push({ player_id: p.id, stableford: sf, scratch: sc, hcp })
    }
  }

  const build = () => {
    const results = tournaments.slice(0, PLAYED).flatMap((t) => tournamentResults(t.id, entries[t.id]))
    const handicaps = Object.entries(entries).flatMap(([tid, rows]) =>
      rows.map((r) => ({ tournament_id: Number(tid), player_id: r.player_id, handicap: r.hcp })),
    )
    return { results, handicaps }
  }

  // Forzamos un empate a puntos entre el 3º y el 4º de Stableford para que se vea el desempate por handicap.
  let { results, handicaps } = build()
  const board = seasonBoard({
    season: DEMO_SEASON, modality: 'stableford', players, tournaments, results, handicaps, currentHcp: {},
  })
  const [third, fourth] = [board[2], board[3]]
  const diff = third.puntos - fourth.puntos
  if (diff > 0) {
    const [tid] = Object.entries(fourth.detalle).filter(([, d]) => d.c).sort((a, b) => b[1].p - a[1].p)[0]
    const e = entries[tid].find((x) => x.player_id === fourth.player_id)
    e.stableford += diff
    ;({ results, handicaps } = build())
  }

  const currentHcp = {}
  for (const h of handicaps) currentHcp[h.player_id] = h.handicap
  for (const p of players) if (currentHcp[p.id] == null) currentHcp[p.id] = baseHcp[p.id]

  // Inscripción abierta para el siguiente torneo (el 5º), con plazas limitadas y algo de reserva.
  const now = Date.now()
  const next = tournaments[PLAYED]
  Object.assign(next, {
    signup_opens_at: new Date(now - 4 * 864e5).toISOString(),
    signup_closes_at: `${next.date}T18:00:00Z`.replace(next.date, new Date(new Date(next.date) - 2 * 864e5).toISOString().slice(0, 10)),
    max_players: 28,
    signup_notes: 'Salidas desde las 9:00 por el tee del 1. Green fee 45 € (se paga en el campo). Comida después en el club.',
    tee_times_published: false,
  })
  const signups = []
  const order = [...players].sort(() => rand() - 0.5).slice(0, 30)
  order.forEach((p, i) => {
    signups.push({
      id: i + 1,
      tournament_id: next.id,
      player_id: p.id,
      nombre: [p.nombre, p.apellido1, p.apellido2].join(' '),
      email: `${p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@ejemplo.com`,
      phone: null,
      hcp: baseHcp[p.id],
      comment: i === 3 ? 'Si puede ser, salir con Jon Arrieta' : null,
      status: i < 28 ? 'inscrito' : 'reserva',
      tee_time: null,
      cancel_token: `demo-${i + 1}`,
      created_at: new Date(now - (4 * 864e5 - i * 3 * 36e5)).toISOString(),
    })
  })
  signups.push({
    id: 31, tournament_id: next.id, player_id: null, nombre: 'Invitado de Prueba Uno', email: null, phone: '600 000 000',
    hcp: 24.5, comment: 'Amigo de Iñaki', status: 'reserva', tee_time: null, cancel_token: 'demo-31',
    created_at: new Date(now - 36e5).toISOString(),
  })

  return {
    signups,
    players,
    tournaments,
    results,
    handicaps,
    currentHcp,
    seasons: [{ year: DEMO_SEASON, name: null, best_n: 4, final_multiplier: 2 }],
    params: [
      { name: 'semanas_exentas', value: 19, valid_from: '2023-01-23', description: 'Semanas recientes sin reducción por antigüedad' },
      { name: 'semanas_reducciones', value: 86, valid_from: '2023-01-23', description: 'Semanas durante las que el valor del torneo va decreciendo' },
      { name: 'Puestos_Puntuables', value: 31, valid_from: '2023-01-23', description: 'Puestos de cada torneo que dan puntos' },
    ],
  }
}
