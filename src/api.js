// Clave pública (anon): solo permite leer lo que las políticas RLS dejan ver.
const BASE = 'https://fghrxdrtygcpqucgntki.supabase.co/rest/v1'
const KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaHJ4ZHJ0eWdjcHF1Y2dudGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTQ4MzIsImV4cCI6MjEwODA3MDgzMn0.3m5PuQ12b-849ykXsjDO3qpXE6lC2G0PumQE9HEKpEg'

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, { headers, ...options })
  if (!res.ok) throw new Error(`Error ${res.status} al leer los datos`)
  return res.json()
}

export const getTournaments = () =>
  request('/tournaments?select=id,name,date,coeficiente,course,is_final&order=date.desc')

export const getParams = () => request('/params?select=name,value,valid_from&order=valid_from.desc')

export const getAnnual = (season, modality) =>
  request('/rpc/annual_standings', {
    method: 'POST',
    body: JSON.stringify({ p_season: season, p_modality: modality }),
  })

export const getRanking = (modality) =>
  request('/rpc/ranking', { method: 'POST', body: JSON.stringify({ p_modality: modality }) })

export const getResults = (tournamentId, modality) =>
  request(
    `/results?tournament_id=eq.${tournamentId}&modality=eq.${modality}` +
      '&select=position,points,players(nombre,apellido1,apellido2)&order=position.asc.nullslast,points.desc',
  )
