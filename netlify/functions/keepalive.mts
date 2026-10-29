// Mantiene despierta la base de datos.
// Supabase pausa los proyectos gratuitos tras 7 días sin actividad; esta función hace una
// consulta pequeña cada día para que eso no pase. Se ve en Netlify > Logs > Functions > keepalive.

// URL y clave públicas (anon): son las mismas que usa la web, solo permiten leer lo público.
const SUPABASE_URL = Netlify.env.get('VITE_SUPABASE_URL') || 'https://fghrxdrtygcpqucgntki.supabase.co'
const SUPABASE_ANON_KEY =
  Netlify.env.get('VITE_SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaHJ4ZHJ0eWdjcHF1Y2dudGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTQ4MzIsImV4cCI6MjEwODA3MDgzMn0.3m5PuQ12b-849ykXsjDO3qpXE6lC2G0PumQE9HEKpEg'

export default async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tournaments?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  const body = await res.text()
  if (!res.ok) {
    // Si el proyecto ya estaba pausado, esto no lo reactiva: hay que pulsar Restore en Supabase.
    console.error(`Supabase respondió ${res.status}: ${body.slice(0, 200)}`)
    return new Response(`error ${res.status}`, { status: 502 })
  }
  console.log(`Supabase OK (${res.status})`)
  return new Response('ok')
}

export const config = {
  // Todos los días a las 05:17 UTC (06:17 en Bilbao en invierno, 07:17 en verano).
  schedule: '17 5 * * *',
}
