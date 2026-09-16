import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = '/api'

export function getToken() {
  return sessionStorage.getItem('ts_token') || localStorage.getItem('ts_token') || ''
}

export function setToken(token, remember = false) {
  sessionStorage.setItem('ts_token', token)
  if (remember) localStorage.setItem('ts_token', token)
}

export function clearToken() {
  sessionStorage.removeItem('ts_token')
  localStorage.removeItem('ts_token')
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (res.status === 401) {
    clearToken()
    // Do NOT hard-navigate when we are already on an auth page. The original
    // code redirected unconditionally, which closed an infinite reload loop:
    //   load /login -> AuthProvider probes /auth/me -> no token -> 401 ->
    //   redirect to /login (full page reload) -> repeat forever.
    // Measured at ~3 page loads per second, so the form was unusable.
    // Only a genuine session expiry (401 while on an app page) should bounce.
    const p = window.location.pathname
    if (p !== '/login' && p !== '/signup') {
      window.location.replace('/login')
    }
    return null
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// Generic data fetching hook
export function useData(path, deps = []) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetch_ = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      const d = await apiFetch(path)
      setData(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path, ...deps])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, refetch: fetch_ }
}

// WebSocket hook for live traces
export function useWebSocket(path, onMessage) {
  const wsRef    = useRef(null)
  const cbRef    = useRef(onMessage)
  const [connected, setConnected] = useState(false)

  useEffect(() => { cbRef.current = onMessage }, [onMessage])

  useEffect(() => {
    if (!path) return
    const token  = getToken()
    const proto  = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host   = window.location.host
    const url    = `${proto}://${host}/ws${path}${token ? `?token=${token}` : ''}`

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen  = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        setTimeout(connect, 3000) // auto-reconnect
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          cbRef.current(msg)
        } catch (_) {}
      }
    }

    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [path])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { connected, send }
}
