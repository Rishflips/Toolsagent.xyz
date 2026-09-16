import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Button, Input } from '../ui/index'
import NeuralPulse from '../ui/NeuralPulse'

function AuthShell({ children, title, sub }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(232,255,71,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(232,255,71,0.015) 1px, transparent 1px)',
        backgroundSize: '44px 44px',
      }} />
      {/* Glow */}
      <div style={{ position: 'fixed', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,255,71,0.04) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, animation: 'fadeUp 0.4s ease both' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, var(--acid), rgba(232,255,71,0.3))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#0A0A0F',
            boxShadow: 'var(--glow-acid)',
          }}>T</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text)', marginBottom: 4 }}>
            tools<span style={{ color: 'var(--acid)' }}>agent</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>AI Agent Console</div>
        </div>

        {/* Pulse */}
        <div style={{ marginBottom: 24, opacity: 0.6 }}>
          <NeuralPulse eventRate={30} height={28} />
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--base1)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: 28, boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>{sub}</div>
          {children}
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          Open source · MIT License · <a href="https://github.com/Rishflips/Toolsagent.xyz" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--acid)', textDecoration: 'none' }}>GitHub ↗</a>
        </div>
      </div>
    </div>
  )
}

// ── LOGIN ────────────────────────────────────────────────────────
export function LoginPage() {
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]   = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/observe')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" sub="Sign in to your workspace">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Email" type="email" placeholder="you@company.com" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <Input label="Password" type="password" placeholder="••••••••" value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
        {error && <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-mono)', background: 'var(--red-dim)', padding: '8px 10px', borderRadius: 6 }}>{error}</div>}
        <Button type="submit" variant="primary" loading={loading} style={{ width: '100%', marginTop: 4 }}>
          Sign in →
        </Button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          No account? <Link to="/signup" style={{ color: 'var(--acid)', textDecoration: 'none' }}>Create one free</Link>
        </div>
      </form>
    </AuthShell>
  )
}

// ── SIGNUP ───────────────────────────────────────────────────────
export function SignupPage() {
  const { signup } = useAuth()
  const navigate   = useNavigate()
  const [form, setForm]   = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError(''); setLoading(true)
    try {
      await signup(form.name, form.email, form.password)
      navigate('/observe')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create your account" sub="One signup. Three AI tools. Instant API keys.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Full Name" type="text" placeholder="Your name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        <Input label="Email" type="email" placeholder="you@company.com" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <Input label="Password" type="password" placeholder="Min 8 characters" value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />

        {/* What you get */}
        <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
          <div style={{ color: 'var(--acid)', fontWeight: 600, marginBottom: 4 }}>Free plan includes:</div>
          <div>◈ Observe · ◇ Spend · ⬡ Deploy</div>
          <div>10K traces · 30d history · 3 API keys</div>
        </div>

        {error && <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-mono)', background: 'var(--red-dim)', padding: '8px 10px', borderRadius: 6 }}>{error}</div>}
        <Button type="submit" variant="primary" loading={loading} style={{ width: '100%', marginTop: 4 }}>
          Create account →
        </Button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--acid)', textDecoration: 'none' }}>Sign in</Link>
        </div>
      </form>
    </AuthShell>
  )
}
