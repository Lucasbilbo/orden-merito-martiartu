export const MODALITIES = [
  { id: 'stableford', label: 'Stableford' },
  { id: 'scratch', label: 'Scratch' },
]

export const fullName = (p) => (p ? [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ') : '')
export const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const d = (iso) => new Date(`${iso}T00:00:00`)
export const formatDate = (iso) => d(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
export const formatShortDate = (iso) => d(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
export const formatMonth = (iso) => {
  const m = d(iso).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
  return m.charAt(0).toUpperCase() + m.slice(1)
}
export const formatPoints = (n, decimals = 0) =>
  Number(n).toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
export const seasonOf = (t) => Number(String(t.date).slice(0, 4))
export const posLabel = (puesto, shared) => (puesto == null ? '–' : shared ? `T${puesto}` : String(puesto))
