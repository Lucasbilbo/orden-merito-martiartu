// Pruebas de la lectura de resultados pegados y del cálculo de puestos. Uso: node scripts/test-lib.mjs
import assert from 'node:assert/strict'
import { matchName, parsePasted, splitName } from '../src/lib/paste.js'
import { tournamentResults } from '../src/lib/standings.js'
import { parseResultSheet, resolveModalities } from '../src/lib/pdfResults.js'
import { cancelSignup, createSignup, makeTeeTimes, publicList, signupState, whatsappText } from '../src/lib/signups.js'

let n = 0
const t = (label, fn) => {
  fn()
  n++
  console.log('OK  ', label)
}

const players = [
  { id: 1, nombre: 'Iñaki', apellido1: 'Etxeberria', apellido2: 'Garai' },
  { id: 2, nombre: 'Ane', apellido1: 'Zubizarreta', apellido2: 'Olano' },
  { id: 3, nombre: 'José Luis', apellido1: 'García', apellido2: 'López' },
  { id: 4, nombre: 'Jon', apellido1: 'García', apellido2: 'Ruiz' },
]

t('pegado desde Excel con cabecera (tabuladores)', () => {
  const { rows, mode } = parsePasted('Jugador\tStableford\tScratch\tHcp\nIñaki Etxeberria\t38\t30\t6,1\nAne Zubizarreta\t35\t\t15.4')
  assert.equal(mode, 'cabecera')
  assert.deepEqual(rows.map((r) => [r.name, r.stableford, r.scratch, r.hcp]), [
    ['Iñaki Etxeberria', 38, 30, 6.1],
    ['Ane Zubizarreta', 35, '', 15.4],
  ])
})

t('CSV con punto y coma sin cabecera', () => {
  const { rows } = parsePasted('Iñaki Etxeberria Garai;38;30;6,1\nAne Zubizarreta;35;22;15,4')
  assert.equal(rows[0].hcp, 6.1)
  assert.equal(rows[1].scratch, 22)
})

t('CSV con comas y cabecera', () => {
  const { rows } = parsePasted('nombre,apellidos,stableford,scratch,hcp\nIñaki,Etxeberria Garai,38,30,6.1')
  assert.equal(rows[0].name, 'Iñaki Etxeberria Garai')
  assert.equal(rows[0].hcp, 6.1)
})

t('texto copiado de un PDF: puesto delante, APELLIDOS, NOMBRE', () => {
  const { rows, mode } = parsePasted('1 ETXEBERRIA GARAI, IÑAKI 38 30 6.1\n2º ZUBIZARRETA OLANO, ANE 35 22 15,4')
  assert.equal(mode, 'texto')
  assert.equal(rows[0].name, 'IÑAKI ETXEBERRIA GARAI')
  assert.deepEqual([rows[1].stableford, rows[1].scratch, rows[1].hcp], [35, 22, 15.4])
})

t('marca errores', () => {
  const { rows } = parsePasted('Fulano;abc;20;5\nMengano;;;')
  assert.match(rows[0].error, /stableford/)
  assert.match(rows[1].error, /sin puntos/)
})

t('empareja nombres con y sin acentos y en mayúsculas', () => {
  assert.equal(matchName('IÑAKI ETXEBERRIA GARAI', players).player_id, 1)
  assert.equal(matchName('Inaki Etxeberria', players).player_id, 1)
  assert.equal(matchName('Ane Zubizarreta Olano', players).player_id, 2)
})

t('no asigna si es ambiguo', () => {
  const m = matchName('García', players)
  assert.equal(m.player_id, null)
})

t('distingue apellidos compartidos', () => {
  assert.equal(matchName('Jon García Ruiz', players).player_id, 4)
  assert.equal(matchName('José Luis García López', players).player_id, 3)
})

t('nombre nuevo se separa en nombre y apellidos', () => {
  assert.deepEqual(splitName('KOLDO URRUTIA BASTERRA'), { nombre: 'Koldo', apellido1: 'Urrutia', apellido2: 'Basterra' })
  assert.deepEqual(splitName('Urrutia, Koldo'), { nombre: 'Koldo', apellido1: 'Urrutia', apellido2: '' })
})

t('puestos del torneo: solo por puntos, empatados comparten puesto', () => {
  const res = tournamentResults(1, [
    { player_id: 1, stableford: 36, hcp: 10 },
    { player_id: 2, stableford: 36, hcp: 8 },
    { player_id: 3, stableford: 40, hcp: 20 },
    { player_id: 4, stableford: 30, hcp: '' },
    { player_id: 5, stableford: 30, hcp: '' },
  ])
  const pos = Object.fromEntries(res.map((r) => [r.player_id, r.position]))
  assert.deepEqual(pos, { 1: 2, 2: 2, 3: 1, 4: 4, 5: 4 })
})

// Líneas como las que reconstruye pdf.js de los listados de los campos (nombres inventados).
const sheetLines = (title) => [
  'Fecha Listado: 12/04/2026',
  'CAMPO DE PRUEBA GOLF',
  'INDIVIDUAL - Stableford   (Recorrido: Prueba)   FECHA: 12/04/2026 CODIGO: X1',
  `${title} (ASC: 0)   1ªVuelta`,
  'POS JUGADOR   CLUB   HEX NVH NIV   S Cat Hpu   1ª   2ª   3ª   4ª   TOT',
  '1 ETXEBERRIA GARAI, IÑAKI   MARTIARTU   15,4   15,5   S   M   3   19   38   38',
  'ZUBIZARRETA OLANO, ANE   PALACIO URGOITI   17,7   17,5   J   F   3   20   38   38',
  '3 URRUTIA BASTERRA, KOLDO   FEDERACIÓN CÁNT 27,4   M M   5   25   35   35',
  '4 ARRIETA URIBE, JO   MARTIARTU   11,9   M M   3   14   30   30',
  '5 GOIKOETXEA LASA, MIKEL   MARTIARTU   31,4   S   M   5   36   N.P',
]

t('PDF del campo: puestos empatados, club cortado, no presentados', () => {
  const s = parseResultSheet(sheetLines('Clasificación Handicap Indistinta'), 'hcdm.pdf')
  assert.equal(s.date, '2026-04-12')
  assert.equal(s.course, 'CAMPO DE PRUEBA GOLF')
  assert.equal(s.modality, 'stableford')
  assert.deepEqual(s.rows.map((r) => [r.name, r.position, r.points, r.hcp]), [
    ['IÑAKI ETXEBERRIA GARAI', 1, 38, 15.4],
    ['ANE ZUBIZARRETA OLANO', 1, 38, 17.7],
    ['KOLDO URRUTIA BASTERRA', 3, 35, 27.4],
    ['JO ARRIETA URIBE', 4, 30, 11.9],
  ])
  assert.equal(s.skipped[0].status, 'N.P')
})

t('modalidad: el PDF sin título claro es la contraria del otro', () => {
  const a = parseResultSheet(sheetLines('TORNEO MARTIARTU'), 'a.pdf')
  const b = parseResultSheet(sheetLines('Torneo Martiartu HCP'), 'b.pdf')
  resolveModalities([a, b])
  assert.equal(a.modality, 'scratch')
  assert.equal(b.modality, 'stableford')
})

t('empareja nombres cortados, abreviados y con erratas', () => {
  const ps = [
    { id: 1, nombre: 'Francisco Javier', apellido1: 'Sobrino', apellido2: 'Andueza' },
    { id: 2, nombre: 'Juan', apellido1: 'Riaño', apellido2: 'García de Pereda' },
    { id: 3, nombre: 'Fermin', apellido1: 'Vidaurre', apellido2: 'Laind' },
    { id: 4, nombre: 'Luis', apellido1: 'Biritxinaga', apellido2: 'Acebal' },
    { id: 5, nombre: 'Jorge', apellido1: 'Biritxinaga', apellido2: 'Acebal' },
    { id: 6, nombre: 'Xabier', apellido1: 'Uriarte', apellido2: 'Garcia-Echave' },
    { id: 7, nombre: 'Jon', apellido1: 'Uriarte', apellido2: 'Garcia-Echave' },
    { id: 8, nombre: 'Juan', apellido1: 'Aniel', apellido2: 'Quiroga' },
  ]
  assert.equal(matchName('FCO. JAVIE SOBRINO ANDUEZA', ps).player_id, 1)
  assert.equal(matchName('JUA RIAÑO GARCIA DE PEREDA', ps).player_id, 2)
  assert.equal(matchName('FERMIN VIDAURRE LAINO', ps).player_id, 3)
  assert.equal(matchName('LUIS BIRICHINAGA ACEBAL', ps).player_id, 4)
  assert.equal(matchName('XAVI URIARTE GARCIA-ECHAVE', ps).player_id, 6)
  assert.equal(matchName('JON URIARTE GARCIA-ECHAVE', ps).player_id, 7)
  // El PDF trae un apellido más que la base
  assert.equal(matchName('JUA ANIEL-QUIROGA TRUJILLO', ps).player_id, 8)
  assert.equal(matchName('PERSONA DESCONOCIDA', ps).player_id, null)
})


t('inscripciones: estado, plazas, reserva, duplicados y anulación', () => {
  const now = new Date('2027-06-01T10:00:00Z')
  const t = { id: 5, date: '2027-06-06', course: 'Abra del Pas', signup_opens_at: '2027-05-25T08:00:00Z', signup_closes_at: '2027-06-04T18:00:00Z', max_players: 2 }
  assert.equal(signupState(t, now), 'abierta')
  assert.equal(signupState(t, new Date('2027-05-20T00:00:00Z')), 'sin_abrir')
  assert.equal(signupState(t, new Date('2027-06-05T00:00:00Z')), 'cerrada')
  assert.equal(signupState({ date: '2027-06-06' }, now), 'no_hay')
  const players = [{ id: 1, nombre: 'Ane', apellido1: 'Zubizarreta', apellido2: 'Olano' }, { id: 2, nombre: 'Jon', apellido1: 'Arrieta', apellido2: null }]
  const list = []
  let k = 0
  const add = (input) => {
    const r = createSignup({ t, signups: list, players, input, now: new Date(now.getTime() + ++k * 1000), uuid: () => `tok${k}` })
    list.push(r)
    return r
  }
  assert.equal(add({ player_id: 1, email: 'a@b.es' }).status, 'inscrito')
  assert.throws(() => add({ player_id: 1, email: 'otro@b.es' }), /ya está inscrito/)
  assert.throws(() => add({ player_id: 2 }), /correo o un teléfono/)
  assert.throws(() => add({ nombre: 'Solo', phone: '600111222' }), /nombre y apellidos/)
  assert.equal(add({ player_id: 2, phone: '600 111 222' }).status, 'inscrito')
  assert.equal(add({ nombre: 'Invitado Prueba', email: 'i@b.es' }).status, 'reserva')
  const up = cancelSignup({ t, signups: list, row: list[0], now })
  assert.equal(up, 'Invitado Prueba')
  assert.deepEqual(publicList(t, list).map((x) => [x.nombre, x.estado]), [['Jon Arrieta', 'inscrito'], ['Invitado Prueba', 'inscrito']])
  assert.throws(() => cancelSignup({ t, signups: list, row: list[1], now: new Date('2027-06-06T08:00:00Z') }), /ya ha empezado/)
})

t('horarios automáticos y texto para WhatsApp', () => {
  assert.deepEqual(makeTeeTimes(['a', 'b', 'c', 'd', 'e'], { start: '09:00', every: 10, per: 4 }), ['09:00', '09:00', '09:00', '09:00', '09:10'])
  assert.deepEqual(makeTeeTimes(['a', 'b'], { start: '09:55', every: 10, per: 1, hole: 'Hoyo 10' }), ['09:55 · Hoyo 10', '10:05 · Hoyo 10'])
  const txt = whatsappText({
    t: { date: '2027-06-06', course: 'Abra del Pas' },
    list: [{ nombre: 'A B', estado: 'inscrito', horario: '09:00' }, { nombre: 'C D', estado: 'inscrito', horario: '09:00' }, { nombre: 'E F', estado: 'reserva' }],
    kind: 'horarios',
  })
  assert.match(txt, /\*09:00\*: A B, C D/)
  assert.doesNotMatch(txt, /E F/)
  const lista = whatsappText({ t: { date: '2027-06-06', course: 'X' }, list: [{ nombre: 'A B', estado: 'inscrito' }, { nombre: 'E F', estado: 'reserva' }], kind: 'lista', url: 'https://x' })
  assert.match(lista, /1\. A B[\s\S]*Reserva \(1\):\n1\. E F[\s\S]*https:\/\/x/)
})

console.log(`\n${n} pruebas OK`)
