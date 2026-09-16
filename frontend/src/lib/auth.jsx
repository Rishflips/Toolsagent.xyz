import { createContext, useContext, useState, useEffect } from 'react'
import { apiFetch, setToken, clearToken } from '../hooks/useApi'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/auth/me')
      .then(d => d && setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false))
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
