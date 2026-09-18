import { clsx } from 'clsx'

// ── BUTTON ──────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', className, loading, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-mono font-semibold transition-all border cursor-pointer select-none'
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-md',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-6 py-3 text-base rounded-xl',
  }
  const variants = {
    primary:  'bg-[var(--acid)] text-[var(--text-inv)] border-[var(--acid)] hover:brightness-110 shadow-[var(--glow-acid)]',
    ghost:    'bg-transparent text-[var(--text2)] border-[var(--border)] hover:border-[var(--border2)] hover:text-[var(--text)] hover:bg-[var(--base2)]',
    danger:   'bg-[var(--red-dim)] text-[var(--red)] border-[rgba(255,77,109,0.3)] hover:bg-[var(--red)] hover:text-white',
    outline:  'bg-transparent text-[var(--acid)] border-[var(--acid-glow)] hover:bg-[var(--acid-dim)]',
    muted:    'bg-[var(--base3)] text-[var(--text2)] border-[var(--border)] hover:bg-[var(--base4)] hover:text-[var(--text)]',
  }
  return (
    <button
      className={clsx(base, sizes[size], variants[variant], loading && 'opacity-60 pointer-events-none', className)}
      style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.3px' }}
      {...props}
    >
      {loading ? <Spinner size={14} /> : children}
    </button>
  )
}

// ── CARD ────────────────────────────────────────────────────────
export function Card({ children, className, glow, onClick, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-xl border transition-all',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        background: 'var(--base1)',
        borderColor: glow ? 'var(--acid-glow)' : 'var(--border)',
        boxShadow: glow ? 'var(--glow-acid)' : 'none',
      }}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}

// ── INPUT ────────────────────────────────────────────────────────
export function Input({ label, error, className, ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </label>
      )}
      <input
        style={{
          background: 'var(--base2)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 'var(--r-md)',
          color: 'var(--text)',
          padding: '9px 12px',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          transition: 'border-color var(--t-fast)',
          width: '100%',
        }}
        onFocus={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--acid)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)'}
        {...props}
      />
      {error && <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{error}</span>}
    </div>
  )
}

// ── SELECT ───────────────────────────────────────────────────────
export function Select({ label, children, className, ...props }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </label>
      )}
      <select
        style={{
          background: 'var(--base2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          color: 'var(--text2)',
          padding: '9px 12px',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          cursor: 'pointer',
          width: '100%',
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

// ── TOGGLE ───────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? 'var(--acid)' : 'var(--base3)',
          border: `1px solid ${checked ? 'var(--acid)' : 'var(--border)'}`,
          position: 'relative', cursor: 'pointer',
          transition: 'background var(--t-base), border-color var(--t-base)',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'var(--text-inv)' : 'var(--text3)',
          transition: 'left var(--t-base), background var(--t-base)',
        }} />
      </div>
      {label && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>}
    </label>
  )
}

// ── SPINNER ──────────────────────────────────────────────────────
export function Spinner({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// ── EMPTY STATE ──────────────────────────────────────────────────
export function EmptyState({ icon, title, desc, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 12 }}>
      {icon && <div style={{ fontSize: 32, marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</div>
      {desc && <div style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 280, lineHeight: 1.6 }}>{desc}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

// ── STAT CARD ────────────────────────────────────────────────────
export function StatCard({ label, value, delta, deltaDir, color, onClick, alert: isAlert, className }) {
  return (
    <Card
      onClick={onClick}
      className={clsx('relative overflow-hidden', className)}
      style={{
        padding: '16px 18px',
        borderColor: isAlert ? 'rgba(255,77,109,0.4)' : 'var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: color || 'var(--acid)', opacity: 0.5, borderRadius: '0 0 10px 10px' }} />
      <div className="t-label" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, lineHeight: 1, color: color || 'var(--text)', marginBottom: 6 }}>
        {value ?? <div className="skeleton" style={{ height: 28, width: 80 }} />}
      </div>
      {delta && (
        <div style={{ fontSize: 10, color: deltaDir === 'up' ? 'var(--green)' : deltaDir === 'down' ? 'var(--red)' : 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          {deltaDir === 'up' ? '↑' : deltaDir === 'down' ? '↓' : ''} {delta}
        </div>
      )}
    </Card>
  )
}

// ── PANEL ────────────────────────────────────────────────────────
export function Panel({ title, subtitle, action, children, className, ...props }) {
  return (
    <Card className={clsx('overflow-hidden', className)} {...props}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ fontSize: 11, color: 'var(--acid)', cursor: 'pointer' }}>{action}</div>}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </Card>
  )
}

// ── TOAST ────────────────────────────────────────────────────────
let _toastCb = null
export function registerToast(cb) { _toastCb = cb }
export function toast(msg, type = 'info') { _toastCb?.(msg, type) }

// ── SAMPLE DATA BANNER ───────────────────────────────────────────
export function SampleBanner({ onClear, loading, moduleName = 'traces' }) {
  return (
    <div
      style={{
        background: 'rgba(232, 255, 71, 0.05)',
        border: '1px solid rgba(232, 255, 71, 0.3)',
        borderLeft: '4px solid var(--acid)',
        borderRadius: 8,
        padding: '12px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            background: 'var(--acid)',
            color: '#0A0A0F',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            padding: '4px 9px',
            borderRadius: 4,
            fontFamily: 'var(--font-mono)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
        >
          <span>◈</span> SAMPLE DATA
        </span>
        <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          You are viewing realistic sample {moduleName} to preview dashboard capabilities. This is not real tenant data.
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        loading={loading}
        onClick={onClear}
        style={{ whiteSpace: 'nowrap', borderColor: 'var(--border2)' }}
      >
        Clear sample data
      </Button>
    </div>
  )
}

// ── EMPTY ONBOARDING CARD (TWO CLEAR PATHS) ───────────────────────
export function EmptyOnboardingCard({
  title = "No real data recorded yet",
  description = "Connect a real source to start seeing live metrics, or reload sample data to preview dashboard features.",
  connectLabel = "+ Connect a real source",
  onConnect,
  onReload,
  reloading
}) {
  return (
    <div
      style={{
        background: 'var(--base2)',
        border: '1px dashed var(--border2)',
        borderRadius: 10,
        padding: '18px 22px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        {onConnect && (
          <Button variant="outline" size="sm" onClick={onConnect}>
            {connectLabel}
          </Button>
        )}
        {onReload && (
          <Button variant="primary" size="sm" loading={reloading} onClick={onReload}>
            ⟳ Reload sample data
          </Button>
        )}
      </div>
    </div>
  )
}
