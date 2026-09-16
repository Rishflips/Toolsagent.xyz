import { createContext, useContext, useState, useEffect } from 'react'
import { apiFetch, setToken, clearToken, getToken } from '../hooks/useApi'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Only ask who we are if there is a token to ask with. Without this guard
    // the provider fires /auth/me on every mount while logged out, gets a
    // guaranteed 401, and (with the old redirect) reloaded the page forever.
    if (!getToken()) {
      setLoading(false)
      return
    }

    let cancelled = false
    apiFetch('/auth/me')
      .then(d => {
        // apiFetch returns null on 401; only set a user for a real payload.
        if (!cancelled && d && d.user) setUser(d.user)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Ignore a late response if this effect was torn down (e.g. StrictMode
    // double-mount in dev), so a stale reply cannot resurrect a dead session.
    return () => { cancelled = true }
  }, [])

  async function login(email, password, remember = false) {
    const d = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (!d) throw new Error('Login failed')
    setToken(d.token, remember)
    setUser(d.user)
    return d
  }

  async function signup(name, email, password) {
    const d = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })
    if (!d) throw new Error('Signup failed')
    setToken(d.token, true)
    setUser(d.user)
    return d
  }

  function logout() {
    clearToken()
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
