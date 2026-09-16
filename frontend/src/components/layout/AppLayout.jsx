import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui/index'
import NeuralPulse from '../ui/NeuralPulse'

const NAV = [
  {
    group: 'Observe',
    color: 'var(--blue)',
    icon: '◈',
    items: [
      { to: '/observe',            label: 'Overview',      icon: '⬡' },
      { to: '/observe/traces',     label: 'Traces',        icon: '⟳', badge: 'live' },
      { to: '/observe/agents',     label: 'Agents',        icon: '◎' },
      { to: '/observe/halluc',     label: 'Hallucinations',icon: '⚡' },
      { to: '/observe/drift',      label: 'Drift',         icon: '∿' },
    ],
  },
  {
    group: 'Spend',
    color: 'var(--acid)',
    icon: '◇',
    items: [
      { to: '/spend',              label: 'Overview',      icon: '◇' },
      { to: '/spend/models',       label: 'By Model',      icon: '⬡' },
      { to: '/spend/features',     label: 'By Feature',    icon: '▦' },
      { to: '/spend/waste',        label: 'Waste Finder',  icon: '♻', badge: '4' },
      { to: '/spend/projections',  label: 'Projections',   icon: '📈' },
    ],
  },
  {
    group: 'Deploy',
    color: 'var(--purple)',
    icon: '⬡',
    items: [
      { to: '/deploy',             label: 'Overview',      icon: '⬡' },
      { to: '/deploy/agents',      label: 'My Agents',     icon: '◈' },
      { to: '/deploy/runs',        label: 'Run History',   icon: '⟳' },
      { to: '/deploy/guardrails',  label: 'Guardrails',    icon: '🛡' },
      { to: '/deploy/keys',        label: 'API Keys',      icon: '⊞' },
    ],
  },
]

export default function AppLayout({ children, eventRate = 0 }) {
  const { user, logout }  = useAuth()
  const { theme, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  // Determine active module for accent color
  const mod = location.pathname.split('/')[1] || 'observe'
  const modColor = mod === 'spend' ? 'var(--acid)' : mod === 'deploy' ? 'var(--purple)' : 'var(--blue)'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width: collapsed ? 56 : 'var(--sidebar-w)',
        background: 'var(--base1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        flexShrink: 0, transition: 'width var(--t-slow)',
        overflow: 'hidden', position: 'relative', zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? '18px 16px' : '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--acid), rgba(232,255,71,0.4))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#0A0A0F',
            boxShadow: 'var(--glow-acid)',
          }}>T</div>
          {!collapsed && (
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              tools<span style={{ color: 'var(--acid)' }}>agent</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: 4, borderRadius: 4, flexShrink: 0 }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Neural Pulse */}
        {!collapsed && (
          <div style={{ padding: '8px 12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
              live · {eventRate}/min
            </div>
            <NeuralPulse eventRate={eventRate} height={32} color={modColor} />
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV.map(group => (
            <div key={group.group}>
              {!collapsed && (
                <div style={{
                  padding: '10px 16px 4px',
                  fontSize: 9, fontWeight: 700, letterSpacing: '2px',
                  textTransform: 'uppercase', color: group.color, opacity: 0.7,
                  fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{group.icon}</span> {group.group}
                </div>
              )}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === `/${mod}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: 9, padding: collapsed ? '10px 16px' : '8px 16px',
                    fontSize: 12, color: isActive ? group.color : 'var(--text2)',
                    background: isActive ? `${group.color}12` : 'transparent',
                    borderLeft: `2px solid ${isActive ? group.color : 'transparent'}`,
                    textDecoration: 'none', transition: 'all var(--t-fast)',
                    whiteSpace: 'nowrap',
                  })}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                          background: item.badge === 'live' ? 'var(--green-dim)' : 'var(--red-dim)',
                          color: item.badge === 'live' ? 'var(--green)' : 'var(--red)',
                          border: `1px solid ${item.badge === 'live' ? 'rgba(0,245,160,0.2)' : 'rgba(255,77,109,0.25)'}`,
                          animation: 'blink 2s infinite',
                        }}>
                          {item.badge === 'live' ? '● live' : item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--acid-dim)', border: '1px solid var(--acid-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--acid)',
                flexShrink: 0,
              }}>
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || 'User'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {user?.plan || 'free'} plan
                </div>
              </div>
              <button onClick={logout} title="Sign out"
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: 4, borderRadius: 4, flexShrink: 0 }}
              >⇥</button>
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          height: 'var(--topbar-h)', background: 'rgba(10,10,15,0.95)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
          flexShrink: 0, backdropFilter: 'blur(12px)', zIndex: 5,
        }}>
          {/* Module indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: modColor, boxShadow: `0 0 8px ${modColor}`, animation: 'blink 2s infinite' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)', textTransform: 'capitalize' }}>{mod}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Theme toggle */}
          <button onClick={toggle}
            style={{
              background: 'var(--base2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', padding: '6px 10px',
              color: 'var(--text2)', cursor: 'pointer', fontSize: 13,
              transition: 'all var(--t-fast)',
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀' : '◑'}
          </button>

          {/* Docs */}
          <a href="https://github.com/Rishflips/Toolsagent.xyz" target="_blank" rel="noopener noreferrer"
            style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 10px', color: 'var(--text2)', fontSize: 11, textDecoration: 'none', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            ⭐ GitHub
          </a>

          <Button variant="outline" size="sm" onClick={() => window.location.href = '/deploy/keys'}>
            + API Key
          </Button>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--base)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
