import { useCallback, useEffect, useState } from 'react'

// Carga asíncrona con estado { loading, error, data } y reload().
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => {
        if (!alive) return
        console.error(error)
        setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}
