import { useState, useEffect, useCallback } from 'react'
import { useWebSocket, useData, apiFetch } from '../../hooks/useApi'
import { StatCard, Panel, EmptyState, Button, SampleBanner, EmptyOnboardingCard, toast } from '../../components/ui/index'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts'

// ── CUSTOM TOOLTIP ───────────────────────────────────────────────
// The latency chart plots seconds and the volume chart plots counts, so the
// unit is decided per series name rather than assumed.
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const isLatency = payload.some(p => p.name === 'p50' || p.name === 'p95')
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>
            {isLatency ? `${Number(p.value).toFixed(2)}s` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── FORMATTERS ───────────────────────────────────────────────────
// The API already formats cost and duration; these are the fallbacks for a
// trace that arrived over the WebSocket before its row was re-fetched.
const money = (v) => {
  const n = Number(v) || 0
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function fmtDuration(ms) {
  const n = Number(ms) || 0
  if (n < 1000)  return `${Math.round(n)}ms`
  if (n < 60000) return `${(n / 1000).toFixed(1)}s`
  const m = Math.floor(n / 60000)
  return `${m}m ${Math.round((n % 60000) / 1000)}s`
}

// One normaliser for both sources. A fetched row carries cost/duration strings;
// a WebSocket frame carries only cost_usd/duration_ms. Same shape out.
function normTrace(t) {
  return {
    ...t,
    cost:     t.cost     !== undefined ? t.cost     : money(t.cost_usd),
    duration: t.duration !== undefined ? t.duration : fmtDuration(t.duration_ms),
    flags:    Array.isArray(t.flags) ? t.flags.filter(Boolean) : [],
    steps:    Array.isArray(t.steps) ? t.steps : [],
  }
}

const FLAG_CHIP = { halluc: ['⚡ halluc', 'chip-purple'], loop: ['⟳ loop', 'chip-red'], drift: ['∿ drift', 'chip-orange'] }

function statusMeta(status) {
  if (status === 'error')   return { color: 'var(--red)',    label: '✕ error',   cls: 'chip-red' }
  if (status === 'warning') return { color: 'var(--orange)', label: '⚠ warning', cls: 'chip-orange' }
  return { color: 'var(--green)', label: '✓ success', cls: 'chip-green' }
}

// ── TRACE ROW ────────────────────────────────────────────────────
function TraceRow({ trace, onClick }) {
  const t = normTrace(trace)
  const st = statusMeta(t.status)
  const flagged = t.flags.includes('loop') || t.status === 'error'

  // Show the real flagged reasons when there are any; otherwise the status is
  // the only true chip. A green "clean" chip on an unlogged row would be a claim.
  const chips = t.flags.length
    ? t.flags.map(f => ({ label: (FLAG_CHIP[f] || [f, 'chip-green'])[0], cls: (FLAG_CHIP[f] || [f, 'chip-green'])[1] }))
    : [{ label: st.label, cls: st.cls }]

  return (
    <div onClick={() => onClick(t)}
      style={{
        display: 'grid', gridTemplateColumns: '8px 1fr auto auto auto',
        alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: flagged ? 'rgba(255,77,109,0.03)' : 'var(--base2)',
        border: `1px solid ${flagged ? 'rgba(255,77,109,0.25)' : 'var(--border)'}`,
        borderRadius: 8, cursor: 'pointer', transition: 'all var(--t-fast)',
        marginBottom: 5,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--acid-glow)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = flagged ? 'rgba(255,77,109,0.25)' : 'var(--border)'}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, boxShadow: `0 0 6px ${st.color}`, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{t.agent} · <span style={{ color: 'var(--text3)' }}>#{t.id?.slice(-8)}</span></div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{t.task} · {t.model}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {chips.map((c, i) => (
          <span key={`${c.label}-${i}`} className={clsx('chip', c.cls)} style={{ fontSize: 9 }}>{c.label}</span>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{t.duration}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acid)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textAlign: 'right' }}>{t.cost}</div>
    </div>
  )
}

// ── TRACE INSPECTOR MODAL ────────────────────────────────────────
function TraceModal({ trace, onClose }) {
  if (!trace) return null
  const t = normTrace(trace)
  const steps = t.steps

  // The old modal read trace.tool_calls / trace.llm_steps — fields the API has
  // never returned, so both counters always rendered 0. Count them from the
  // real decision chain instead.
  const toolCalls = steps.filter(s => s.type === 'tool').length
  const llmSteps  = steps.filter(s => s.type === 'think').length

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 660, maxHeight: '82vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Trace Inspector</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{t.agent} · #{t.id?.slice(-8)} · {t.model}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { k: 'Duration',  v: t.duration,   c: 'var(--red)' },
              { k: 'Cost',      v: t.cost,       c: 'var(--acid)' },
              { k: 'Tool Calls',v: toolCalls,    c: 'var(--text)' },
              { k: 'LLM Steps', v: llmSteps,     c: 'var(--text)' },
            ].map(m => (
              <div key={m.k} style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{m.k}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>Decision Chain</div>
          {steps.length === 0 ? (
            <EmptyState icon="◇" title="No decision chain recorded"
              desc="This trace was logged without steps. Pass a steps array to ta.observe.trace() to see it here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {steps.map((step, i) => {
                const nodeColors = { think: 'var(--blue)', tool: 'var(--acid)', flag: 'var(--red)', result: 'var(--green)', warn: 'var(--orange)' }
                const c = nodeColors[step.type] || 'var(--text3)'
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: 2 }}>
                    {i < steps.length - 1 && <div style={{ position: 'absolute', left: 15, top: 30, bottom: -2, width: 1, background: 'linear-gradient(to bottom, var(--border2), transparent)' }} />}
                    <div style={{ width: 30, height: 30, borderRadius: '50%', border: `1.5px solid ${c}`, background: `${c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, zIndex: 1 }}>
                      {step.type === 'think' ? '🧠' : step.type === 'tool' ? '🔧' : step.type === 'flag' ? '⚡' : step.type === 'result' ? '✓' : '⚠'}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: step.type === 'flag' ? 'var(--red)' : 'var(--text)', marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)' }}>
                        <span>{step.label}</span>
                        <span style={{ fontSize: 9, color: 'var(--text3)' }}>{step.ts}</span>
                      </div>
                      {step.detail && <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.55 }}>{step.detail}</div>}
                      {step.code && <div style={{ fontSize: 9, background: 'var(--base3)', border: '1px solid var(--border)', borderRadius: 5, padding: '5px 8px', marginTop: 5, color: 'var(--acid)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.code}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConnectTraceModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 620, maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Connect a Real Source</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Instrument your agents with ToolsAgent to send live traces</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--acid)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>1. PYTHON SDK</div>
            <pre style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', overflowX: 'auto', lineHeight: 1.6 }}>
{`import toolsagent as ta

ta.init(api_key="ts_your_api_key")

with ta.observe.trace(agent="support-agent", task="invoice-query", model="gpt-4o"):
    # Agent thinking and tool execution
    response = agent.run("Handle invoice inquiry #1042")`}
            </pre>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--acid)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>2. HTTP API / cURL</div>
            <pre style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', overflowX: 'auto', lineHeight: 1.6 }}>
{`curl -X POST http://localhost:4000/api/v1/observe/traces \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"support-agent","task":"invoice-query","model":"gpt-4o","duration_ms":1250,"cost_usd":0.0032}'`}
            </pre>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Manage keys at <a href="/deploy/keys" style={{ color: 'var(--acid)', textDecoration: 'none' }}>/deploy/keys</a></span>
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── OVERVIEW PAGE ────────────────────────────────────────────────
export default function ObserveOverview({ onEventRate }) {
  const [traces, setTraces]     = useState([])
  const [selected, setSelected] = useState(null)
  const [liveCount, setLiveCount] = useState(0)
  const [clearing, setClearing]   = useState(false)
  const [reloading, setReloading] = useState(false)
  const [showConnect, setShowConnect] = useState(false)

  const { data, loading, error, refetch } = useData('/v1/observe/traces?limit=50')
  const { data: dashData, error: dashError, refetch: refetchDash } = useData('/v1/observe/dashboard')

  // History from the API. Empty until the fetch lands — never seeded with mocks.
  useEffect(() => {
    if (!data?.traces) {
      setTraces([])
      return
    }
    setTraces(data.traces.map(normTrace))
  }, [data])

  // Live WebSocket frames merge into the same list, de-duplicated by id so a
  // trace that arrives twice (once live, once on refetch) shows once.
  const { connected } = useWebSocket('/traces', useCallback((msg) => {
    if (msg.type === 'trace' && msg.data) {
      const incoming = normTrace(msg.data)
      setTraces(prev => [incoming, ...prev.filter(t => t.id !== incoming.id)].slice(0, 100))
      setLiveCount(c => c + 1)
    }
  }, []))

  // Report event rate to parent for neural pulse
  useEffect(() => {
    const interval = setInterval(() => {
      onEventRate?.(liveCount)
      setLiveCount(0)
    }, 60000)
    return () => clearInterval(interval)
  }, [liveCount, onEventRate])

  const dash   = dashData || {}
  const agents = dash.agents || []
  const volume = dash.volume || []
  const latency = dash.latency || []
  const hals   = dash.hallucinations || []
  const isSample = Boolean(dash.is_sample ?? data?.is_sample)

  const handleClear = async () => {
    setClearing(true)
    try {
      await apiFetch('/v1/sample-data/clear', { method: 'POST' })
      toast('Sample data cleared', 'info')
      await Promise.all([refetch(), refetchDash()])
    } catch (e) {
      toast('Failed to clear sample data: ' + e.message, 'error')
    } finally {
      setClearing(false)
    }
  }

  const handleReload = async () => {
    setReloading(true)
    try {
      await apiFetch('/v1/sample-data/reload', { method: 'POST' })
      toast('Sample data loaded', 'success')
      await Promise.all([refetch(), refetchDash()])
    } catch (e) {
      toast('Failed to reload sample data: ' + e.message, 'error')
    } finally {
      setReloading(false)
    }
  }

  // Traces / 6h comes from the dashboard aggregate over the real 6h window —
  // the length of the 50-row page is not that number.
  const total6h = Number(dash.traces_6h) || 0
  const prev6h  = Number(dash.traces_prev_6h) || 0
  const delta   = prev6h > 0
    ? `${((total6h - prev6h) / prev6h * 100).toFixed(1)}% vs prev 6h`
    : (total6h > 0 ? 'no prior 6h window' : null)

  const successRate = dash.success_rate || (total6h > 0 ? '—' : '—')
  const flagRate    = dash.success_rate ? `${(100 - parseFloat(dash.success_rate)).toFixed(2)}%` : '—'

  // Only a real flagged trace raises the banner, and it names that trace.
  const looped = traces.find(t => t.flags.includes('loop'))

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Loading traces…
    </div>
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Could not load traces: {error}
      <div style={{ marginTop: 12 }}><Button variant="ghost" size="sm" onClick={refetch}>Retry</Button></div>
    </div>
  }

  return (
    <div style={{ padding: 24 }}>

      {/* Sample Data Banner */}
      {isSample && (
        <SampleBanner
          moduleName="traces"
          loading={clearing}
          onClear={handleClear}
        />
      )}

      {/* Empty State Onboarding: offers two clear paths */}
      {!isSample && traces.length === 0 && (
        <EmptyOnboardingCard
          title="No real traces recorded yet"
          description="Connect a real agent source to start observing live traces, or reload the sample data to explore dashboard features."
          connectLabel="+ Send a trace"
          onConnect={() => setShowConnect(true)}
          onReload={handleReload}
          reloading={reloading}
        />
      )}

      {/* Alert — derived from a real flagged trace, not a hardcoded story */}
      {looped && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, animation: 'fadeUp 0.4s ease' }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>Tool Loop Flagged — {looped.agent}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {looped.task} · trace #{looped.id?.slice(-8)} · {looped.cost} recorded
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setSelected(looped)}>Inspect →</Button>
        </div>
      )}

      {dashError && (
        <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>⚠</span><span style={{ flex: 1 }}>Summary metrics unavailable: {dashError}</span>
          <Button variant="ghost" size="sm" onClick={refetchDash}>Retry</Button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="⟳ Traces / 6h" value={total6h.toLocaleString()} delta={delta} deltaDir={total6h >= prev6h ? 'up' : 'down'} color="var(--blue)" />
        <StatCard label="✓ Success Rate" value={successRate} delta={total6h > 0 ? `${total6h} traces in window` : 'no traces yet'} color="var(--green)" />
        <StatCard label="⚡ Flag Rate" value={flagRate} delta={dash.halluc_count ? `${dash.halluc_count} flagged output${dash.halluc_count === 1 ? '' : 's'}` : null} deltaDir="down" color="var(--red)" alert={Number(parseFloat(flagRate)) > 0} />
        <StatCard label="⏱ Avg Latency" value={dash.avg_latency || '—'} delta={latency.length ? `P95 peak: ${Math.max(...latency.map(l => l.p95)).toFixed(1)}s` : null} color="var(--text)" />
        <StatCard label="◇ Cost / 6h" value={dash.cost_6h || '$0.00'} delta={agents.length ? `${agents.length} agent${agents.length === 1 ? '' : 's'} active` : null} color="var(--orange)" />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: 14, marginBottom: 14 }}>

        {/* Traces */}
        <Panel title="⟳ Recent Traces" subtitle="Click any trace to inspect decision chain" action="View all →">
          {traces.length === 0 ? (
            <EmptyState icon="⟳" title="No traces yet"
              desc="Send your first trace with ta.observe.trace() or reload sample data to preview."
              action={
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                  <Button variant="outline" size="sm" onClick={() => setShowConnect(true)}>+ Send trace</Button>
                  <Button variant="ghost" size="sm" loading={reloading} onClick={handleReload}>Reload sample data</Button>
                </div>
              }
            />
          ) : (
            <div>{traces.slice(0, 6).map(t => <TraceRow key={t.id} trace={t} onClick={setSelected} />)}</div>
          )}
        </Panel>

        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="◈ Trace Volume + Flags" subtitle="6h window · 30min buckets">
            {volume.length === 0 ? (
              <EmptyState icon="◈" title="No volume in this window"
                desc="Buckets fill as traces arrive. Each half hour is one bar, zero-inclusive." />
            ) : (
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={volume} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="traces" fill="rgba(77,158,255,0.5)" radius={[2,2,0,0]} />
                  <Bar dataKey="flags" fill="rgba(255,77,109,0.7)" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
          <Panel title="⏱ Latency Trends" subtitle="P50 + P95 over 6h">
            {latency.length === 0 ? (
              <EmptyState icon="⏱" title="No latency yet"
                desc="Percentiles are computed from real trace durations in the last 6h." />
            ) : (
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={latency} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="p50" stroke="var(--acid)" fill="rgba(232,255,71,0.06)" strokeWidth={1.5} dot={false} name="P50" />
                  <Area type="monotone" dataKey="p95" stroke="var(--orange)" fill="rgba(255,140,66,0.05)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="P95" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        {/* Agent Health — real agents from the last hour, health measured */}
        <Panel title="◈ Agent Health" subtitle="Last hour">
          {agents.length === 0 ? (
            <EmptyState icon="◈" title="No agents reporting"
              desc="Agents appear here once they log a trace. Health is the share of runs that succeeded." />
          ) : (
            agents.slice(0, 5).map(a => {
              const healthColor = a.health >= 90 ? 'var(--green)' : a.health >= 60 ? 'var(--orange)' : 'var(--red)'
              const chip = a.health >= 90 ? ['clean', 'chip-green'] : a.health >= 60 ? ['degraded', 'chip-orange'] : ['failing', 'chip-red']
              return (
                <div key={a.agent} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--base3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>◈</div>
                    <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent}</div>
                    <span className={clsx('chip', chip[1])} style={{ fontSize: 9 }}>{chip[0]}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--base3)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ height: '100%', width: `${a.health}%`, background: healthColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                    <span>{a.health}% health</span><span>{a.runs}/hr · ${a.avg_cost}/run</span>
                  </div>
                </div>
              )
            })
          )}
        </Panel>
      </div>

      {/* Hallucination Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Panel title="⚡ Hallucination Radar" subtitle="Last 6h" action="Review all →">
          {hals.length === 0 ? (
            <EmptyState icon="⚡" title="No flagged outputs"
              desc="Nothing has been flagged as a hallucination in the last 6h. Flagged outputs are recorded against the trace they came from." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hals.map(h => (
                <div key={h.id} style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(180,122,255,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>{h.agent}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{h.score}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{h.excerpt}</div>
                  <div style={{ marginTop: 5, height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${h.pct}%`, background: 'linear-gradient(90deg, var(--red), var(--purple))' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* WebSocket status — shows the host actually in use, not a placeholder */}
        <Panel title="◈ WebSocket Status" subtitle={connected ? 'Live trace stream active' : 'Connecting…'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={`pulse-dot ${connected ? 'green' : 'red'}`} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: connected ? 'var(--green)' : 'var(--red)' }}>
                {connected ? 'Live · receiving traces' : 'Disconnected · reconnecting…'}
              </span>
            </div>
            <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 2, overflowWrap: 'anywhere' }}>
              <div>Endpoint: <span style={{ color: 'var(--acid)' }}>{typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/traces` : '/ws/traces'}</span></div>
              <div>Protocol: <span style={{ color: 'var(--text)' }}>WebSocket · JSON frames</span></div>
              <div>Auth: <span style={{ color: 'var(--text)' }}>Bearer JWT in query param</span></div>
              <div>Reconnect: <span style={{ color: 'var(--green)' }}>Auto · 3s backoff</span></div>
            </div>
          </div>
        </Panel>

        <Panel title="∿ Drift Monitor" subtitle="Prompt behavior over time">
          <EmptyState icon="∿" title="No drift detected" desc="Drift monitoring watches your agent's reasoning patterns for deviations. Connect an agent to start." />
        </Panel>
      </div>

      {selected && <TraceModal trace={selected} onClose={() => setSelected(null)} />}
      {showConnect && <ConnectTraceModal onClose={() => setShowConnect(false)} />}
    </div>
  )
}
