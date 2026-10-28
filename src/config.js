// Conexión a Supabase. La clave es la pública (anon): solo permite lo que dejan las políticas RLS.
// Se puede sobrescribir con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Netlify > Environment variables).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fghrxdrtygcpqucgntki.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaHJ4ZHJ0eWdjcHF1Y2dudGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0OTQ4MzIsImV4cCI6MjEwODA3MDgzMn0.3m5PuQ12b-849ykXsjDO3qpXE6lC2G0PumQE9HEKpEg'

// Modo demo: datos inventados en el navegador. Se activa con ?demo=1 y se quita con ?demo=0.
const KEY = 'om-demo'
function readDemoFlag() {
  try {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (q === '1') sessionStorage.setItem(KEY, '1')
    if (q === '0') sessionStorage.removeItem(KEY)
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return new URLSearchParams(window.location.search).get('demo') === '1'
  }
}
export const DEMO = typeof window !== 'undefined' && readDemoFlag()
