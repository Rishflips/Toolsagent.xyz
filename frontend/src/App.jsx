import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useCallback, useEffect } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeContext, useThemeProvider } from './hooks/useTheme'
import AppLayout from './components/layout/AppLayout'
import { LoginPage, SignupPage } from './components/layout/AuthPages'
import ObserveOverview from './modules/observe/Overview'
import SpendOverview from './modules/spend/Overview'
import DeployOverview from './modules/deploy/Overview'
import { registerToast } from './components/ui/index'
import { Spinner } from './components/ui/index'

// ── TOAST SYSTEM ─────────────────────────────────────────────────
function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    registerToast((msg, type = 'info') => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, msg, type }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
    })
  }, [])

  const colors = { info: 'var(--blue)', success: 'var(--green)', error: 'var(--red)', warn: 'var(--acid)' }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'var(--base2)', border: `1px solid ${colors[t.type]}44`,
          borderLeft: `3px solid ${colors[t.type]}`,
          borderRadius: 'var(--r-md)', padding: '10px 16px',
          fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
          boxShadow: 'var(--shadow-md)', maxWidth: 320, animation: 'fadeUp 0.3s ease',
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── PROTECTED ROUTE ───────────────────────────────────────────────
// AUTH_DISABLED (owner decision 2026-09-18): the login wall is removed while the
// auth flow is being fixed, so the console opens straight into the app. Set
// VITE_AUTH_DISABLED=false and rebuild to restore the redirect to /login.
const AUTH_OPEN = import.meta.env.VITE_AUTH_DISABLED !== 'false'

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (AUTH_OPEN) return children

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--base)' }}>
      <Spinner size={28} color="var(--acid)" />
    </div>
  )

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

// ── PLACEHOLDER PAGE ──────────────────────────────────────────────
function Placeholder({ title }) {
  return (
    <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Coming soon — contribute on GitHub</div>
      </div>
    </div>
  )
}

// ── APP INNER ─────────────────────────────────────────────────────
function AppInner() {
  const [eventRate, setEventRate] = useState(0)
  const onEventRate = useCallback((rate) => setEventRate(rate), [])

  return (
    <>
      <Routes>
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route path="/*" element={
          <Protected>
            <AppLayout eventRate={eventRate}>
              <Routes>
                <Route path="/"                  element={<Navigate to="/observe" replace />} />

                {/* Observe */}
                <Route path="/observe"           element={<ObserveOverview onEventRate={onEventRate} />} />
                <Route path="/observe/traces"    element={<Placeholder title="Trace Explorer" />} />
                <Route path="/observe/agents"    element={<Placeholder title="Agent Registry" />} />
                <Route path="/observe/halluc"    element={<Placeholder title="Hallucination Review" />} />
                <Route path="/observe/drift"     element={<Placeholder title="Drift Monitor" />} />

                {/* Spend */}
                <Route path="/spend"             element={<SpendOverview />} />
                <Route path="/spend/models"      element={<Placeholder title="Spend by Model" />} />
                <Route path="/spend/features"    element={<Placeholder title="Spend by Feature" />} />
                <Route path="/spend/waste"       element={<Placeholder title="Waste Finder" />} />
                <Route path="/spend/projections" element={<Placeholder title="Projections" />} />

                {/* Deploy */}
                <Route path="/deploy"            element={<DeployOverview />} />
                <Route path="/deploy/agents"     element={<Placeholder title="My Agents" />} />
                <Route path="/deploy/runs"       element={<Placeholder title="Run History" />} />
                <Route path="/deploy/guardrails" element={<Placeholder title="Guardrail Builder" />} />
                <Route path="/deploy/keys"       element={<Placeholder title="API Keys" />} />

                <Route path="*" element={<Navigate to="/observe" replace />} />
              </Routes>
            </AppLayout>
          </Protected>
        } />
      </Routes>

      <ToastContainer />
    </>
  )
}

// ── ROOT ──────────────────────────────────────────────────────────
export default function App() {
  const themeValue = useThemeProvider()

  return (
    <ThemeContext.Provider value={themeValue}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeContext.Provider>
  )
}
