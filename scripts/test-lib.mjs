// Pruebas de la lectura de resultados pegados y del cálculo de puestos. Uso: node scripts/test-lib.mjs
import assert from 'node:assert/strict'
import { matchName, parsePasted, splitName } from '../src/lib/paste.js'
import { tournamentResults } from '../src/lib/standings.js'

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

t('puestos: más puntos, luego hándicap más bajo, empate compartido', () => {
  const res = tournamentResults(1, [
    { player_id: 1, stableford: 36, hcp: 10 },
    { player_id: 2, stableford: 36, hcp: 8 },
    { player_id: 3, stableford: 40, hcp: 20 },
    { player_id: 4, stableford: 30, hcp: '' },
    { player_id: 5, stableford: 30, hcp: '' },
  ])
  const pos = Object.fromEntries(res.map((r) => [r.player_id, r.position]))
  assert.deepEqual(pos, { 1: 3, 2: 2, 3: 1, 4: 4, 5: 4 })
})

console.log(`\n${n} pruebas OK`)
