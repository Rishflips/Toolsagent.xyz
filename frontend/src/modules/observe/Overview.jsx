import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '../../hooks/useApi'
import { StatCard, Panel, EmptyState, Button } from '../../components/ui/index'
import { clsx } from 'clsx'
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts'

// ── CUSTOM TOOLTIP ───────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── TRACE ROW ────────────────────────────────────────────────────
function TraceRow({ trace, onClick }) {
  const statusColor = trace.status === 'error' ? 'var(--red)' : trace.status === 'warning' ? 'var(--orange)' : 'var(--green)'
  const flags = trace.flags || []

  return (
    <div onClick={() => onClick(trace)}
      style={{
        display: 'grid', gridTemplateColumns: '8px 1fr auto auto auto',
        alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: flags.includes('error') || flags.includes('loop') ? 'rgba(255,77,109,0.03)' : 'var(--base2)',
        border: `1px solid ${flags.includes('error') || flags.includes('loop') ? 'rgba(255,77,109,0.25)' : 'var(--border)'}`,
        borderRadius: 8, cursor: 'pointer', transition: 'all var(--t-fast)',
        marginBottom: 5,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--acid-glow)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = flags.includes('error') ? 'rgba(255,77,109,0.25)' : 'var(--border)'}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{trace.agent} · <span style={{ color: 'var(--text3)' }}>#{trace.id?.slice(-8)}</span></div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{trace.task} · {trace.model}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {flags.map(f => (
          <span key={f} className={clsx('chip', f === 'halluc' ? 'chip-purple' : f === 'loop' ? 'chip-red' : f === 'drift' ? 'chip-orange' : 'chip-green')} style={{ fontSize: 9 }}>
            {f === 'halluc' ? '⚡ halluc' : f === 'loop' ? '⟳ loop' : f === 'drift' ? '∿ drift' : '✓ clean'}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{trace.duration}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acid)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', textAlign: 'right' }}>${trace.cost}</div>
    </div>
  )
}

// ── TRACE INSPECTOR MODAL ────────────────────────────────────────
function TraceModal({ trace, onClose }) {
  if (!trace) return null
  const steps = trace.steps || []

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 660, maxHeight: '82vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Trace Inspector</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{trace.agent} · #{trace.id?.slice(-8)} · {trace.model}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { k: 'Duration', v: trace.duration, c: 'var(--red)' },
              { k: 'Cost', v: `$${trace.cost}`, c: 'var(--acid)' },
              { k: 'Tool Calls', v: trace.tool_calls || 0, c: 'var(--text)' },
              { k: 'LLM Steps', v: trace.llm_steps || 0, c: 'var(--text)' },
            ].map(m => (
              <div key={m.k} style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{m.k}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>

          {trace.diagnosis && (
            <div style={{ background: 'rgba(255,77,109,0.06)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 11, color: 'var(--text2)', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>Root Cause: </span>{trace.diagnosis.root_cause}<br/>
              <span style={{ color: 'var(--acid)', fontWeight: 700 }}>Fix: </span>{trace.diagnosis.fix}
            </div>
          )}

          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>Decision Chain</div>
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
        </div>
      </div>
    </div>
  )
}

// ── MOCK DATA ────────────────────────────────────────────────────
const MOCK_TRACES = [
  { id: 'tr_9a2f1234', agent: 'research-agent', task: 'market_research', model: 'claude-3-5-sonnet', status: 'error', flags: ['loop', 'cost'], duration: '4m 12s', cost: '0.121', tool_calls: 38, llm_steps: 14,
    diagnosis: { root_cause: 'Agent called web_search 6× with identical query — stuck in reasoning loop without reformulation.', fix: 'Add max_consecutive_tool_calls=3 to SDK config. Add "reformulate on no new info" system prompt instruction.' },
    steps: [
      { type: 'think', label: 'System Prompt Received', ts: '+0ms', detail: 'Task: Research top 5 AI competitors and pricing' },
      { type: 'tool',  label: 'web_search #1', ts: '+412ms', code: 'query: "AI competitor pricing 2024"' },
      { type: 'think', label: 'LLM Reasoning', ts: '+3.2s', detail: 'Results too general. Needs specific pricing data.' },
      { type: 'tool',  label: 'web_search #2 — IDENTICAL', ts: '+3.5s', code: 'query: "AI competitor pricing 2024"', detail: '⚠ Same query — REPEAT #2 of 6' },
      { type: 'flag',  label: 'Loop Detected', ts: '+72s', detail: '6× identical tool calls. Agent stuck. Slack alert sent.' },
      { type: 'warn',  label: 'Still Running…', ts: '+252s', detail: '$0.12 and counting. Circuit breaker needed.' },
    ]
  },
  { id: 'tr_7b1e5678', agent: 'research-agent', task: 'competitor_analysis', model: 'claude-3-5-sonnet', status: 'warning', flags: ['halluc'], duration: '12.3s', cost: '0.021' },
  { id: 'tr_4c9d9abc', agent: 'support-agent', task: 'resolve_ticket_8841', model: 'claude-3-5-haiku', status: 'success', flags: ['clean'], duration: '2.3s', cost: '0.004' },
  { id: 'tr_2a7cdef0', agent: 'email-drafter', task: 'outreach_batch_447', model: 'gpt-4o-mini', status: 'success', flags: ['clean'], duration: '18.4s', cost: '0.031' },
  { id: 'tr_1f5a1111', agent: 'research-agent', task: 'news_monitor', model: 'claude-3-5-sonnet', status: 'warning', flags: ['drift', 'halluc'], duration: '8.7s', cost: '0.019' },
  { id: 'tr_0e8b2222', agent: 'support-agent', task: 'resolve_ticket_8840', model: 'claude-3-5-haiku', status: 'success', flags: ['clean'], duration: '1.9s', cost: '0.003' },
]

const MOCK_VOLUME = [
  { t: '18:00', traces: 210, flags: 2 }, { t: '18:30', traces: 245, flags: 3 },
  { t: '19:00', traces: 290, flags: 1 }, { t: '19:30', traces: 318, flags: 5 },
  { t: '20:00', traces: 280, flags: 2 }, { t: '20:30', traces: 305, flags: 4 },
  { t: '21:00', traces: 412, flags: 11},{ t: '21:30', traces: 388, flags: 8 },
  { t: '22:00', traces: 340, flags: 3 }, { t: '22:30', traces: 295, flags: 2 },
  { t: '23:00', traces: 271, flags: 1 }, { t: '23:30', traces: 287, flags: 3 },
]

const MOCK_LATENCY = [
  { t: '18:00', p50: 1.2, p95: 4.1 }, { t: '18:30', p50: 1.4, p95: 5.2 },
  { t: '19:00', p50: 1.8, p95: 6.8 }, { t: '19:30', p50: 2.1, p95: 8.4 },
  { t: '20:00', p50: 1.9, p95: 7.1 }, { t: '20:30', p50: 2.3, p95: 9.2 },
  { t: '21:00', p50: 3.1, p95: 14.2},{ t: '21:30', p50: 2.8, p95: 11.8},
  { t: '22:00', p50: 2.1, p95: 8.3 }, { t: '22:30', p50: 1.7, p95: 6.4 },
  { t: '23:00', p50: 1.5, p95: 5.1 }, { t: '23:30', p50: 1.6, p95: 5.8 },
]

// ── OVERVIEW PAGE ────────────────────────────────────────────────
export default function ObserveOverview({ onEventRate }) {
  const [traces, setTraces]       = useState(MOCK_TRACES)
  const [selected, setSelected]   = useState(null)
  const [liveCount, setLiveCount] = useState(0)

  // WebSocket for live traces
  const { connected } = useWebSocket('/traces', useCallback((msg) => {
    if (msg.type === 'trace') {
      setTraces(prev => [msg.data, ...prev].slice(0, 50))
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

  const stats = {
    total:   traces.length,
    success: traces.filter(t => t.status === 'success').length,
    flags:   traces.filter(t => t.flags?.some(f => f !== 'clean')).length,
    avgCost: (traces.reduce((s, t) => s + parseFloat(t.cost || 0), 0) / traces.length).toFixed(4),
  }

  return (
    <div style={{ padding: 24 }}>

      {/* Alert */}
      {traces.some(t => t.flags?.includes('loop')) && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, animation: 'fadeUp 0.4s ease' }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>Tool Loop Detected — research-agent</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>6× identical web_search calls · trace #tr_9a2f · $0.12 and counting</div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setSelected(traces[0])}>Inspect →</Button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="⟳ Traces / 6h" value={traces.length.toLocaleString()} delta="↑ 12.4% vs prev" deltaDir="up" color="var(--blue)" />
        <StatCard label="✓ Success Rate" value={`${((stats.success/stats.total)*100).toFixed(1)}%`} delta="↓ 0.4% · 3 failures" deltaDir="down" color="var(--green)" />
        <StatCard label="⚡ Flag Rate" value={`${((stats.flags/stats.total)*100).toFixed(2)}%`} delta="↑ +0.03% · 3 flagged" deltaDir="down" color="var(--red)" alert />
        <StatCard label="⏱ Avg Latency" value="2.8s" delta="P95: 8.4s · P99: 22s" color="var(--text)" />
        <StatCard label="◇ Cost / 6h" value="$4.82" delta="↑ +18% · runaway agent" deltaDir="down" color="var(--orange)" />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: 14, marginBottom: 14 }}>

        {/* Traces */}
        <Panel title="⟳ Recent Traces" subtitle="Click any trace to inspect decision chain" action="View all →">
          <div>
            {traces.slice(0, 6).map(t => <TraceRow key={t.id} trace={t} onClick={setSelected} />)}
          </div>
        </Panel>

        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="◈ Trace Volume + Flags" subtitle="6h window · 30min buckets">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={MOCK_VOLUME} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="traces" fill="rgba(77,158,255,0.5)" radius={[2,2,0,0]} />
                <Bar dataKey="flags" fill="rgba(255,77,109,0.7)" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="⏱ Latency Trends" subtitle="P50 + P95 over 6h">
            <ResponsiveContainer width="100%" height={90}>
              <AreaChart data={MOCK_LATENCY} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: 'var(--text3)', fontFamily: 'var(--font-mono)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="p50" stroke="var(--acid)" fill="rgba(232,255,71,0.06)" strokeWidth={1.5} dot={false} name="P50" />
                <Area type="monotone" dataKey="p95" stroke="var(--orange)" fill="rgba(255,140,66,0.05)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="P95" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* Agent Health */}
        <Panel title="◈ Agent Health" subtitle="Live status" action="Configure →">
          {[
            { name: 'research-agent', icon: '🔍', health: 42, runs: 24, cost: '$0.041', status: 'loop',  statusColor: 'var(--red)' },
            { name: 'support-agent',  icon: '🎧', health: 97, runs: 312, cost: '$0.004', status: 'clean', statusColor: 'var(--green)' },
            { name: 'email-drafter',  icon: '✉️',  health: 81, runs: 47,  cost: '$0.018', status: 'drift', statusColor: 'var(--orange)' },
          ].map(a => (
            <div key={a.name} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--base3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{a.icon}</div>
                <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{a.name}</div>
                <span className={clsx('chip', a.status === 'clean' ? 'chip-green' : a.status === 'loop' ? 'chip-red' : 'chip-orange')} style={{ fontSize: 9 }}>{a.status}</span>
              </div>
              <div style={{ height: 4, background: 'var(--base3)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${a.health}%`, background: a.statusColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                <span>{a.health}% health</span><span>{a.runs}/hr · {a.cost}/run</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      {/* Hallucination Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Panel title="⚡ Hallucination Radar" subtitle="Last 6h" action="Review all →">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { agent: 'research-agent · tr_7b1e', score: 0.87, excerpt: '"Acme Corp reported $42M ARR in Q3" — no source found in tool results. Model confabulated.', pct: 87 },
              { agent: 'research-agent · tr_1f5a', score: 0.73, excerpt: '"CompetitorX pricing starts at $299/mo" — tool call returned no pricing data for this claim.', pct: 73 },
              { agent: 'email-drafter · tr_3d2c',  score: 0.61, excerpt: '"As per our 30-day money-back guarantee…" — no such policy in RAG context.', pct: 61 },
            ].map((h, i) => (
              <div key={i} style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', cursor: 'pointer' }}
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
        </Panel>

        <Panel title="◈ WebSocket Status" subtitle={connected ? 'Live trace stream active' : 'Connecting…'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className={`pulse-dot ${connected ? 'green' : 'red'}`} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: connected ? 'var(--green)' : 'var(--red)' }}>
                {connected ? 'Live · receiving traces' : 'Disconnected · reconnecting…'}
              </span>
            </div>
            <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 2 }}>
              <div>Endpoint: <span style={{ color: 'var(--acid)' }}>wss://your-host.example.com/ws/traces</span></div>
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
    </div>
  )
}
