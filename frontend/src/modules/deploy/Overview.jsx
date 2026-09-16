import { useState } from 'react'
import { StatCard, Panel, Button, EmptyState } from '../../components/ui/index'
import { clsx } from 'clsx'

// ── AGENT CARD ───────────────────────────────────────────────────
function AgentCard({ agent, onInspect }) {
  const statusColor = agent.status === 'running' ? 'var(--green)' : agent.status === 'error' ? 'var(--red)' : agent.status === 'idle' ? 'var(--text3)' : 'var(--acid)'

  return (
    <div style={{
      background: 'var(--base1)', border: `1px solid ${agent.status === 'error' ? 'rgba(255,77,109,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)', overflow: 'hidden', transition: 'all var(--t-base)',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--acid-glow)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = agent.status === 'error' ? 'rgba(255,77,109,0.3)' : 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--base3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{agent.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{agent.version} · {agent.model}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}`, animation: agent.status === 'running' ? 'blink 2s infinite' : 'none' }} />
          <span style={{ fontSize: 10, color: statusColor, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase' }}>{agent.status}</span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '1px solid var(--border)' }}>
        {[
          { k: 'Runs today', v: agent.runs_today },
          { k: 'Success %', v: agent.success_rate },
          { k: 'Avg cost', v: agent.avg_cost },
        ].map(m => (
          <div key={m.k} style={{ padding: '10px 14px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{m.k}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Active task */}
      {agent.current_task && (
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--blue)', background: 'var(--blue-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--blue)', animation: 'blink 1.5s infinite', flexShrink: 0 }} />
          {agent.current_task}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
        <Button variant="ghost" size="sm" onClick={() => onInspect(agent)} style={{ flex: 1 }}>Inspect</Button>
        {agent.status === 'running'
          ? <Button variant="danger" size="sm" style={{ flex: 1 }}>⏹ Stop</Button>
          : <Button variant="muted" size="sm" style={{ flex: 1 }}>▶ Run</Button>
        }
      </div>
    </div>
  )
}

// ── RUN ROW ───────────────────────────────────────────────────────
function RunRow({ run }) {
  const sc = run.status === 'success' ? 'var(--green)' : run.status === 'error' ? 'var(--red)' : 'var(--acid)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto auto auto auto', alignItems: 'center', gap: 12, padding: '9px 14px', background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 5, cursor: 'pointer', transition: 'border-color var(--t-fast)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--acid-glow)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, boxShadow: `0 0 5px ${sc}88`, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{run.agent} · <span style={{ color: 'var(--text3)' }}>#{run.id.slice(-8)}</span></div>
        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>{run.task}</div>
      </div>
      <span className={clsx('chip', run.status === 'success' ? 'chip-green' : run.status === 'error' ? 'chip-red' : 'chip-acid')} style={{ fontSize: 9 }}>{run.status}</span>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{run.blocks} blocks</div>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{run.duration}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acid)', fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }}>{run.cost}</div>
    </div>
  )
}

// ── GUARDRAIL CARD ────────────────────────────────────────────────
function GuardrailCard({ rule }) {
  const [enabled, setEnabled] = useState(rule.enabled)
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{rule.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5 }}>{rule.desc}</div>
        {rule.triggers > 0 && (
          <div style={{ marginTop: 5, fontSize: 10, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>⚡ Triggered {rule.triggers}× today</div>
        )}
      </div>
      <div
        onClick={() => setEnabled(e => !e)}
        style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? 'var(--acid)' : 'var(--base3)', border: `1px solid ${enabled ? 'var(--acid)' : 'var(--border)'}`, position: 'relative', cursor: 'pointer', transition: 'all var(--t-base)', flexShrink: 0, marginTop: 2 }}
      >
        <div style={{ position: 'absolute', top: 2, left: enabled ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: enabled ? 'var(--text-inv)' : 'var(--text3)', transition: 'left var(--t-base)' }} />
      </div>
    </div>
  )
}

// ── DEPLOY AGENT MODAL ────────────────────────────────────────────
function DeployModal({ onClose }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: '', github: '', model: 'claude-3-5-sonnet-20241022', description: '' })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 580, boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Deploy Agent</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Step {step} of 3 — {step === 1 ? 'Configuration' : step === 2 ? 'Guardrails' : 'Deploy'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 0 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 3, background: s <= step ? 'var(--acid)' : 'var(--base3)', transition: 'background var(--t-base)' }} />
          ))}
        </div>

        <div style={{ padding: '20px 22px' }}>
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Agent Name</div>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. research-agent"
                  style={{ width: '100%', background: 'var(--base2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>GitHub URL (optional)</div>
                <input value={form.github} onChange={e => setForm(f => ({ ...f, github: e.target.value }))} placeholder="https://github.com/org/repo"
                  style={{ width: '100%', background: 'var(--base2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Model</div>
                <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  style={{ width: '100%', background: 'var(--base2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }}>
                  {['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'gpt-4o', 'gpt-4o-mini'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>System Prompt</div>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="You are a helpful research agent…" rows={4}
                  style={{ width: '100%', background: 'var(--base2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', resize: 'none' }} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>Configure safety guardrails for your agent:</div>
              {[
                { name: 'PII Detection', desc: 'Block outputs containing emails, phone numbers, or SSN patterns.', enabled: true },
                { name: 'Max Tool Calls', desc: 'Limit consecutive identical tool calls to 3 to prevent loops.', enabled: true },
                { name: 'Cost Circuit Breaker', desc: 'Stop agent if single run exceeds $0.50.', enabled: true },
                { name: 'Profanity Filter', desc: 'Block outputs containing profanity or hate speech.', enabled: false },
                { name: 'Hallucination Check', desc: 'Flag outputs citing facts not found in tool results.', enabled: false },
              ].map((r, i) => <GuardrailCard key={i} rule={r} />)}
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🚀</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>Ready to deploy</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.7, maxWidth: 360, margin: '0 auto 20px' }}>
                <strong style={{ color: 'var(--acid)' }}>{form.name || 'my-agent'}</strong> will be deployed with 3 guardrails active.
                Your API key will be provisioned automatically.
              </div>
              <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', textAlign: 'left', marginBottom: 20 }}>
                <div style={{ color: 'var(--acid)', marginBottom: 6 }}># Run your agent via SDK</div>
                <div>from toolsagent import Agent</div>
                <div>agent = Agent("<span style={{ color: 'var(--acid)' }}>{form.name || 'my-agent'}</span>")</div>
                <div>result = agent.run("Your task here")</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            {step > 1 && <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}>← Back</Button>}
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {step < 3
              ? <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)}>Next →</Button>
              : <Button variant="primary" size="sm">🚀 Deploy Agent</Button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MOCK DATA ─────────────────────────────────────────────────────
const MOCK_AGENTS = [
  { id: 'ag_001', name: 'research-agent', icon: '🔍', version: 'v2.1.0', model: 'claude-3-5-sonnet', status: 'error', runs_today: 24, success_rate: '42%', avg_cost: '$0.041', current_task: null },
  { id: 'ag_002', name: 'support-agent',  icon: '🎧', version: 'v1.4.2', model: 'claude-3-5-haiku', status: 'running', runs_today: 312, success_rate: '97%', avg_cost: '$0.004', current_task: 'Resolving ticket #8842 · step 3/5' },
  { id: 'ag_003', name: 'email-drafter',  icon: '✉️',  version: 'v1.0.8', model: 'gpt-4o-mini',      status: 'running', runs_today: 47, success_rate: '81%', avg_cost: '$0.018', current_task: 'Drafting outreach for james@acme.io' },
  { id: 'ag_004', name: 'doc-summariser', icon: '📄', version: 'v0.9.1', model: 'gemini-1.5-pro',   status: 'idle',    runs_today: 8,  success_rate: '100%', avg_cost: '$0.008', current_task: null },
  { id: 'ag_005', name: 'code-reviewer',  icon: '👁',  version: 'v0.2.0', model: 'claude-3-5-sonnet', status: 'idle',   runs_today: 0,  success_rate: '—',    avg_cost: '—',      current_task: null },
]

const MOCK_RUNS = [
  { id: 'run_9a2f1234', agent: 'support-agent',  task: 'resolve_ticket_8842', status: 'success', blocks: 5, duration: '2.1s', cost: '$0.004' },
  { id: 'run_7b1e5678', agent: 'email-drafter',  task: 'outreach_batch_448',  status: 'success', blocks: 3, duration: '8.4s', cost: '$0.012' },
  { id: 'run_4c9d9abc', agent: 'research-agent', task: 'market_research',      status: 'error',   blocks: 14,duration: '4m 12s',cost:'$0.121' },
  { id: 'run_2a7cdef0', agent: 'doc-summariser', task: 'summarise_q3_report',  status: 'success', blocks: 4, duration: '3.2s', cost: '$0.008' },
  { id: 'run_1f5a1111', agent: 'support-agent',  task: 'resolve_ticket_8841',  status: 'success', blocks: 5, duration: '2.3s', cost: '$0.004' },
]

const MOCK_GUARDRAILS = [
  { name: 'PII Detection',       desc: 'Blocks outputs containing emails, SSN, phone numbers.',    enabled: true,  triggers: 4 },
  { name: 'Loop Breaker',        desc: 'Stops agent after 3 consecutive identical tool calls.',    enabled: true,  triggers: 1 },
  { name: 'Cost Circuit Breaker',desc: 'Halts run if single execution exceeds $0.50.',             enabled: true,  triggers: 0 },
  { name: 'Profanity Filter',    desc: 'Blocks outputs containing profanity or hate speech.',      enabled: true,  triggers: 0 },
  { name: 'Hallucination Flag',  desc: 'Flags outputs citing facts not in tool results.',          enabled: false, triggers: 0 },
]

// ── OVERVIEW PAGE ─────────────────────────────────────────────────
export default function DeployOverview() {
  const [showDeploy, setShowDeploy] = useState(false)
  const [inspected, setInspected]   = useState(null)

  return (
    <div style={{ padding: 24 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>Agent Fleet</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{MOCK_AGENTS.length} agents · 2 running · 1 error</div>
        </div>
        <Button variant="primary" onClick={() => setShowDeploy(true)}>🚀 Deploy Agent</Button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="⬡ Live Agents"   value="2"      delta="of 5 total"       color="var(--green)" />
        <StatCard label="⟳ Runs today"    value="391"    delta="↑ 24% vs yesterday" deltaDir="up" color="var(--blue)" />
        <StatCard label="✓ Success rate"   value="96.4%"  delta="↓ 0.8%"           deltaDir="down" color="var(--green)" />
        <StatCard label="🛡 Guardrail hits" value="5"     delta="4 PII · 1 loop"   color="var(--orange)" />
        <StatCard label="◇ Total cost"     value="$1.82"  delta="↓ 12% vs yesterday" deltaDir="up" color="var(--acid)" />
      </div>

      {/* Agent grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        {MOCK_AGENTS.map(a => <AgentCard key={a.id} agent={a} onInspect={setInspected} />)}
      </div>

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>

        {/* Run history */}
        <Panel title="⟳ Recent Runs" subtitle="Last 24h · click to replay" action="View all →">
          <div>
            {MOCK_RUNS.map(r => <RunRow key={r.id} run={r} />)}
          </div>
        </Panel>

        {/* Guardrails */}
        <Panel title="🛡 Guardrails" subtitle="Active safety rules" action="+ Add rule">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOCK_GUARDRAILS.map((g, i) => <GuardrailCard key={i} rule={g} />)}
          </div>
        </Panel>
      </div>

      {showDeploy && <DeployModal onClose={() => setShowDeploy(false)} />}
    </div>
  )
}
