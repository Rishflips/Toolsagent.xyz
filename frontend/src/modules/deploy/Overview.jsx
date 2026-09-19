import { useState, useMemo } from 'react'
import { StatCard, Panel, Button, EmptyState, toast } from '../../components/ui/index'
import { useData, apiFetch } from '../../hooks/useApi'
import { clsx } from 'clsx'

// Every number on this screen comes from /v1/deploy/agents or /v1/deploy/runs.
// There are no sample rows: an account with no agents shows an empty state.
//
// Two honesty rules are load-bearing here and must not be "improved" away:
//   1. The Run button records a run REQUEST. No runner exists yet, so the toast
//      says exactly that instead of implying an agent executed.
//   2. A guardrail is shown as enabled only because an agent's stored config
//      carries it. Nothing enforces them yet (Week 3), so a trigger count of 0
//      is labelled "none recorded", never "none configured".

const money = (v) => {
  const n = Number(v) || 0
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

// ── AGENT CARD ───────────────────────────────────────────────────
function AgentCard({ agent, onInspect, onRun, running }) {
  const openRequests = Number(agent.runs_running) || 0
  const statusColor = openRequests > 0 ? 'var(--acid)' : 'var(--text3)'
  const statusLabel = openRequests > 0 ? `${openRequests} request${openRequests === 1 ? '' : 's'} open` : 'idle'

  return (
    <div style={{
      background: 'var(--base1)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden', transition: 'all var(--t-base)',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--acid-glow)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--base3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>◈</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{agent.version} · {agent.model}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={openRequests > 0 ? 'A run request was recorded and no runner has picked it up' : 'No run in flight'}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <span style={{ fontSize: 10, color: statusColor, fontFamily: 'var(--font-mono)', fontWeight: 600, textTransform: 'uppercase' }}>{statusLabel}</span>
        </div>
      </div>

      {/* Metrics — measured from agent_runs, "—" when there is nothing to measure */}
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

      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{agent.runs_total} run{agent.runs_total === 1 ? '' : 's'} recorded</span>
        <span>{agent.runs_failed} failed · {agent.total_cost} total</span>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
        <Button variant="ghost" size="sm" onClick={() => onInspect(agent)} style={{ flex: 1 }}>Inspect</Button>
        <Button variant="muted" size="sm" loading={running} onClick={() => onRun(agent)} style={{ flex: 1 }} title="Records a run request. Nothing executes it yet.">▶ Run request</Button>
      </div>
    </div>
  )
}

// ── RUN ROW ───────────────────────────────────────────────────────
function RunRow({ run }) {
  const sc = run.status === 'success' ? 'var(--green)' : run.status === 'error' ? 'var(--red)' : 'var(--acid)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto auto auto auto', alignItems: 'center', gap: 12, padding: '9px 14px', background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc, boxShadow: `0 0 5px ${sc}88`, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{run.agent} · <span style={{ color: 'var(--text3)' }}>#{String(run.id).slice(-8)}</span></div>
        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>{run.task}</div>
      </div>
      <span className={clsx('chip', run.status === 'success' ? 'chip-green' : run.status === 'error' ? 'chip-red' : 'chip-acid')} style={{ fontSize: 9 }}>{run.status}</span>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{run.blocks} blocks</div>
      <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{run.duration}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--acid)', fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }}>{run.cost}</div>
    </div>
  )
}

// ── GUARDRAIL ROW ─────────────────────────────────────────────────
// Read-only by design: the state shown is the agents' stored configuration, so
// a switch here would be a control that writes nowhere.
function GuardrailRow({ rule }) {
  const on = rule.enabled_agents > 0
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: on ? 'var(--acid)' : 'var(--base3)', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{rule.name}</div>
        <span className={clsx('chip', on ? 'chip-acid' : 'chip-green')} style={{ fontSize: 9 }}>
          {on ? `${rule.enabled_agents} agent${rule.enabled_agents === 1 ? '' : 's'}` : 'not enabled'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5 }}>{rule.desc}</div>
      <div style={{ marginTop: 5, fontSize: 10, fontFamily: 'var(--font-mono)', color: rule.triggers > 0 ? 'var(--orange)' : 'var(--text3)' }}>
        {rule.triggers > 0 ? `⚡ ${rule.triggers} trigger${rule.triggers === 1 ? '' : 's'} today` : 'no triggers recorded today'}
      </div>
    </div>
  )
}

// ── INSPECT PANEL ─────────────────────────────────────────────────
function InspectPanel({ agent, runs, onClose }) {
  const onKeys = Object.entries(agent.guardrails || {}).filter(([, v]) => v).map(([k]) => k)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 620, maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{agent.version} · {agent.model} · {agent.runs_total} runs recorded</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Stored guardrail config</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: onKeys.length ? 'var(--acid)' : 'var(--text3)', marginBottom: 14 }}>
            {onKeys.length ? onKeys.join(', ') : 'none enabled'}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>System prompt</div>
          <div style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap', marginBottom: 14 }}>
            {agent.system_prompt || '(empty)'}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>Recent runs</div>
          {runs.length === 0
            ? <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>No runs recorded for this agent.</div>
            : runs.slice(0, 6).map(r => <RunRow key={r.id} run={r} />)}
        </div>
      </div>
    </div>
  )
}

// ── DEPLOY MODAL ──────────────────────────────────────────────────
// Creates a real agent record through POST /v1/deploy/agents. It does NOT deploy
// anything: there is no runner. The final step says so instead of promising one.
const DEFAULT_RULES = { pii_detection: true, loop_breaker: true, cost_limit: true, profanity_filter: false, hallucination_check: false }

function DeployModal({ catalogue, onClose, onCreated }) {
  const [step, setStep]     = useState(1)
  const [busy, setBusy]     = useState(false)
  const [rules, setRules]   = useState(DEFAULT_RULES)
  const [form, setForm]     = useState({ name: '', github: '', model: 'claude-3-5-sonnet-20241022', description: '' })

  const enabledCount = Object.values(rules).filter(Boolean).length

  async function submit() {
    setBusy(true)
    try {
      // cost_limit travels as a number, not a boolean — the schema default is 0.50.
      const payload = Object.fromEntries(
        Object.entries(rules).map(([k, v]) => [k, k === 'cost_limit' ? (v ? 0.50 : null) : v])
      )
      await apiFetch('/v1/deploy/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          model: form.model,
          system_prompt: form.description,
          github_url: form.github || null,
          guardrails: payload,
        }),
      })
      toast('Agent record created — execution is not implemented yet', 'info')
      await onCreated()
      onClose()
    } catch (e) {
      toast('Could not create agent: ' + e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--base1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', width: 580, boxShadow: 'var(--shadow-lg)', animation: 'fadeUp 0.2s ease' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Add Agent</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Step {step} of 3 — {step === 1 ? 'Configuration' : step === 2 ? 'Guardrails' : 'Review'}</div>
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
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                These are stored as configuration on the agent. Nothing enforces them yet.
              </div>
              {catalogue.map(rule => (
                <div key={rule.key} onClick={() => setRules(r => ({ ...r, [rule.key]: !r[rule.key] }))}
                  style={{ background: 'var(--base2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{rule.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5 }}>{rule.desc}</div>
                  </div>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: rules[rule.key] ? 'var(--acid)' : 'var(--base3)', border: `1px solid ${rules[rule.key] ? 'var(--acid)' : 'var(--border)'}`, position: 'relative', transition: 'all var(--t-base)', flexShrink: 0, marginTop: 2 }}>
                    <div style={{ position: 'absolute', top: 2, left: rules[rule.key] ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: rules[rule.key] ? 'var(--text-inv)' : 'var(--text3)', transition: 'left var(--t-base)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>◈</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>Review</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-mono)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto 14px' }}>
                <strong style={{ color: 'var(--acid)' }}>{form.name || '(name required)'}</strong> will be saved as an agent record with {enabledCount} guardrail{enabledCount === 1 ? '' : 's'} in its stored config.
              </div>
              <div style={{ background: 'var(--base2)', border: '1px solid rgba(255,140,66,0.35)', borderRadius: 8, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', textAlign: 'left', marginBottom: 8, lineHeight: 1.7 }}>
                <div style={{ color: 'var(--orange)', marginBottom: 4 }}>// not implemented yet</div>
                <div>No runner exists, so this record will not execute anything.</div>
                <div>Guardrail enforcement lands in Week 3.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            {step > 1 && <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}>← Back</Button>}
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {step < 3
              ? <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)} disabled={step === 1 && !form.name}>Next →</Button>
              : <Button variant="primary" size="sm" loading={busy} disabled={!form.name} onClick={submit}>Save agent record</Button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ── OVERVIEW PAGE ─────────────────────────────────────────────────
export default function DeployOverview() {
  const [showDeploy, setShowDeploy] = useState(false)
  const [inspected, setInspected]   = useState(null)
  const [runningId, setRunningId]   = useState(null)

  const { data, loading, error, refetch } = useData('/v1/deploy/agents')
  const { data: runData, refetch: refetchRuns } = useData('/v1/deploy/runs?limit=25')

  const agents         = data?.agents || []
  const catalogue      = data?.guardrails || []
  const runs           = runData?.runs || []
  const execImplemented = data?.execution_implemented === true
  const execNotice     = data?.execution_notice
    || 'Agent execution is not implemented yet — the Run button records a request only.'

  const totals = useMemo(() => {
    const openRequests = agents.reduce((s, a) => s + (Number(a.runs_running) || 0), 0)
    const runsToday    = agents.reduce((s, a) => s + (Number(a.runs_today) || 0), 0)
    const ok           = agents.reduce((s, a) => s + (a.runs_total - a.runs_failed), 0)
    const all          = agents.reduce((s, a) => s + Number(a.runs_total), 0)
    const cost         = agents.reduce((s, a) => s + parseFloat(String(a.total_cost).replace('$', '') || 0), 0)
    const hits         = catalogue.reduce((s, g) => s + (Number(g.triggers) || 0), 0)
    return {
      openRequests,
      runsToday,
      all,
      cost: money(cost),
      hits,
      successRate: all > 0 ? `${(ok / all * 100).toFixed(1)}%` : '—',
    }
  }, [agents, catalogue])

  // Records a real run request through the existing endpoint, then says plainly
  // that nothing executes it. The request row is real; the execution is not.
  async function handleRun(agent) {
    setRunningId(agent.id)
    try {
      const res = await apiFetch(`/v1/deploy/agents/${agent.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ task: 'manual run request from console' }),
      })
      toast(res?.notice || execNotice, 'info')
      await Promise.all([refetch(), refetchRuns()])
    } catch (e) {
      toast('Could not record run request: ' + e.message, 'error')
    } finally {
      setRunningId(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading agents…</div>
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Could not load agents: {error}
      <div style={{ marginTop: 12 }}><Button variant="ghost" size="sm" onClick={refetch}>Retry</Button></div>
    </div>
  }

  const inspectedRuns = inspected ? runs.filter(r => r.agent === inspected.name) : []

  return (
    <div style={{ padding: 24 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>Agent Fleet</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {agents.length} agent{agents.length === 1 ? '' : 's'} · {totals.openRequests} run request{totals.openRequests === 1 ? '' : 's'} open
          </div>
        </div>
        <Button variant="primary" onClick={() => setShowDeploy(true)}>+ Add Agent</Button>
      </div>

      {/* Capability notice — the one place the screen states what does not exist */}
      {!execImplemented && (
        <div style={{ background: 'var(--base2)', border: '1px solid rgba(255,140,66,0.35)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 10 }}>
          <span>⚠</span><span style={{ flex: 1 }}>{execNotice} Guardrails are stored configuration only — nothing enforces them yet.</span>
        </div>
      )}

      {/* KPIs — every value measured from agents + runs, "—" when unmeasurable */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="⟳ Runs today" value={totals.runsToday} delta={totals.all > 0 ? `${totals.all} all time` : 'no runs yet'} color="var(--blue)" />
        <StatCard label="✓ Success rate" value={totals.successRate} delta={totals.all > 0 ? `${totals.all} recorded runs` : 'nothing recorded'} color="var(--green)" />
        <StatCard label="🛡 Guardrail hits" value={totals.hits} delta="today · none recorded until Week 3" color="var(--orange)" alert={totals.hits > 0} />
        <StatCard label="◇ Total cost" value={totals.cost} delta={`across ${agents.length} agent${agents.length === 1 ? '' : 's'}`} color="var(--acid)" />
        <StatCard label="◈ Open runs" value={totals.openRequests} delta={execImplemented ? 'being executed' : 'no runner exists'} color="var(--text)" />
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <Panel title="◈ Agents">
          <EmptyState icon="◈" title="No agents yet"
            desc="An agent record stores the model, system prompt and guardrail configuration. Execution is not implemented yet, so a record runs nothing."
            action={<Button variant="outline" size="sm" onClick={() => setShowDeploy(true)}>+ Add your first agent</Button>} />
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
          {agents.map(a => <AgentCard key={a.id} agent={a} onInspect={setInspected} onRun={handleRun} running={runningId === a.id} />)}
        </div>
      )}

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, marginBottom: 14 }}>

        {/* Run history */}
        <Panel title="⟳ Recent Runs" subtitle="Fleet-wide · newest first">
          {runs.length === 0 ? (
            <EmptyState icon="⟳" title="No runs recorded"
              desc="A run request is recorded when you press Run. Nothing executes it yet, so runs stay open." />
          ) : (
            <div>{runs.map(r => <RunRow key={r.id} run={r} />)}</div>
          )}
        </Panel>

        {/* Guardrails */}
        <Panel title="🛡 Guardrails" subtitle="Stored config · not enforced yet">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {catalogue.map(g => <GuardrailRow key={g.key} rule={g} />)}
          </div>
        </Panel>
      </div>

      {showDeploy && <DeployModal catalogue={catalogue} onClose={() => setShowDeploy(false)} onCreated={refetch} />}
      {inspected && <InspectPanel agent={inspected} runs={inspectedRuns} onClose={() => setInspected(null)} />}
    </div>
  )
}
