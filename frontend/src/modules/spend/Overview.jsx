import { useState } from 'react'
import { StatCard, Panel, Button, EmptyState, SampleBanner, EmptyOnboardingCard, toast } from '../../components/ui/index'
import { useData, apiFetch } from '../../hooks/useApi'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => {
        const v = Number(p.value)
        return (
          <div key={p.name} style={{ color: p.color, display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <span>{p.name}</span>
            <span style={{ fontWeight: 600 }}>
              {Number.isFinite(v) ? (v < 10 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// A real presentational lookup keyed on provider name. Colours are ours; the
// keys come from data.
const PROV_COLORS = { anthropic: '#c9a96e', openai: '#10a37f', google: '#4285f4', cohere: '#9b59b6' }
const PROV_FALLBACK = ['#4D9EFF', '#FF8C42', '#B47AFF', '#00F5A0']
const FEATURE_COLORS = ['var(--red)', 'var(--acid)', 'var(--green)', 'var(--purple)', 'var(--blue)', 'var(--orange)']

// Mirrors the API's formatCost: never round a real sub-cent cost down to
// "$0.00", which would read as free.
const money = (v) => {
  const n = Number(v) || 0
  if (n === 0) return '$0.00'
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function fmtTokens(n) {
  const v = Number(n) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
  return String(v)
}

// Recharts treats a string dataKey as a dotted path, so a provider or feature
// name containing a dot would be read as a nested lookup and never match. Map
// every real name to a safe positional key and keep the display name beside it.
function seriesFrom(rows, colors, colorMap) {
  const names = [...new Set(rows.flatMap(r => Object.keys(r).filter(k => k !== 'd')))].sort()
  return names.map((name, i) => ({
    key: `k${i}`,
    name,
    color: (colorMap && colorMap[name]) || colors[i % colors.length],
  }))
}

function toRows(rows, series) {
  return rows.map(r => {
    const out = { d: r.d }
    for (const s of series) {
      if (r[s.name] !== undefined && r[s.name] !== null) out[s.key] = Number(r[s.name])
    }
    return out
  })
}

// Connect Key Modal
function ConnectKeyModal({ onClose }) {
  const [provider, setProvider] = useState('')
  const [key, setKey]           = useState('')
  const [label, setLabel]       = useState('')
  const HINTS = {
    openai:'sk-proj-… (billing:read scope)', anthropic:'sk-ant-… (usage:read scope)',
    google:'Service account JSON or AI Studio key', cohere:'co-… (read-only)',
    mistral:'mi-… (billing:read)', groq:'gsk_… (read scope)',
  }

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--base1)',border:'1px solid var(--border2)',borderRadius:'var(--r-xl)',width:560,boxShadow:'var(--shadow-lg)',animation:'fadeUp 0.2s ease' }}>
        <div style={{ padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'flex-start',justifyContent:'space-between' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:16,marginBottom:4 }}>Connect Provider Key</div>
            <div style={{ fontSize:11,color:'var(--text3)',fontFamily:'var(--font-mono)' }}>Read-only · AES-256 encrypted · never logged</div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:18,lineHeight:1,padding:4 }}>✕</button>
        </div>
        <div style={{ padding:'18px 22px' }}>
          <div style={{ background:'var(--green-dim)',border:'1px solid rgba(0,245,160,0.2)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'var(--text2)',lineHeight:1.65,marginBottom:16,fontFamily:'var(--font-mono)' }}>
            🔒 <span style={{ color:'var(--green)',fontWeight:600 }}>Security first.</span> ToolsAgent only reads billing metadata — minimum scopes only. Your key is never used to make API calls.
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'1px',fontFamily:'var(--font-mono)',marginBottom:6 }}>Provider</div>
              <select value={provider} onChange={e=>setProvider(e.target.value)}
                style={{ width:'100%',background:'var(--base2)',border:'1px solid var(--border)',color:'var(--text)',padding:'9px 12px',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:12,outline:'none' }}>
                <option value="">Select…</option>
                {['openai','anthropic','google','cohere','mistral','groq'].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'1px',fontFamily:'var(--font-mono)',marginBottom:6 }}>Label</div>
              <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. production"
                style={{ width:'100%',background:'var(--base2)',border:'1px solid var(--border)',color:'var(--text)',padding:'9px 12px',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:12,outline:'none' }} />
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'1px',fontFamily:'var(--font-mono)',marginBottom:6 }}>
              API Key {provider && <span style={{ color:'var(--text3)',textTransform:'none',letterSpacing:0 }}>— {HINTS[provider]}</span>}
            </div>
            <input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste your read-only API key…"
              style={{ width:'100%',background:'var(--base2)',border:'1px solid var(--border)',color:'var(--text)',padding:'9px 12px',borderRadius:8,fontFamily:'var(--font-mono)',fontSize:12,outline:'none' }} />
          </div>
          <div style={{ display:'flex',gap:10,justifyContent:'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm">Connect & Sync →</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SpendOverview() {
  const [showConnect, setShowConnect] = useState(false)
  const [clearing, setClearing]       = useState(false)
  const [reloading, setReloading]     = useState(false)
  const { data, loading, error, refetch } = useData('/v1/spend/dashboard?range=30d')

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Loading spend data…
    </div>
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      Could not load spend data: {error}
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" size="sm" onClick={refetch}>Retry</Button>
      </div>
    </div>
  }

  const dash     = data || {}
  const spend    = dash.spend      || {}
  const waste    = dash.waste      || {}
  const proj     = dash.projection || {}
  const models   = dash.by_model   || []
  const daily    = dash.daily_spend || []
  const output   = dash.output_cost || []
  const features = dash.by_feature  || []
  const providers = dash.providers  || []
  const alerts   = dash.active_alerts || []
  const wasteItems = waste.items || []
  const isSample = Boolean(dash.is_sample)

  const handleClear = async () => {
    setClearing(true)
    try {
      await apiFetch('/v1/sample-data/clear', { method: 'POST' })
      toast('Sample data cleared', 'info')
      await refetch()
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
      await refetch()
    } catch (e) {
      toast('Failed to reload sample data: ' + e.message, 'error')
    } finally {
      setReloading(false)
    }
  }

  const totalTokens = Number(spend.total_tokens) || 0
  const totalSpend  = Number(spend.total_30d) || 0

  // Chart series come from the keys actually present in the data.
  const provSeries = seriesFrom(daily, PROV_FALLBACK, PROV_COLORS)
  const provRows   = toRows(daily, provSeries)
  const featSeries = seriesFrom(output, FEATURE_COLORS)
  const featRows   = toRows(output, featSeries)

  const featureTotal = features.reduce((s, f) => s + Number(f.cost || 0), 0)
  const costPer1k    = totalTokens > 0 ? (totalSpend / totalTokens) * 1000 : null
  const retryCost    = Number(waste.total_waste_cost || 0)
  const overBudget   = !!proj.over_budget

  return (
    <div style={{ padding: 24 }}>

      {/* Sample Data Banner */}
      {isSample && (
        <SampleBanner
          moduleName="spend"
          loading={clearing}
          onClear={handleClear}
        />
      )}

      {/* Empty State Onboarding: offers two clear paths */}
      {!isSample && models.length === 0 && (
        <EmptyOnboardingCard
          title="No real spend recorded yet"
          description="Connect a provider API key or send spend events to track costs, or reload the sample data to explore dashboard features."
          connectLabel="+ Add Provider Key"
          onConnect={() => setShowConnect(true)}
          onReload={handleReload}
          reloading={reloading}
        />
      )}

      {/* Spike / budget alerts — shown only when the API reports real ones. */}
      {alerts.length > 0 && (
        <div style={{ background:'var(--red-dim)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'flex-start',gap:12,marginBottom:20,animation:'fadeUp 0.4s ease' }}>
          <span style={{ fontSize:16 }}>⚡</span>
          <div style={{ flex:1 }}>
            {alerts.slice(0, 3).map((a, i) => (
              <div key={i} style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:13,color: a.level === 'error' ? 'var(--red)' : 'var(--acid)', marginBottom: i < alerts.length - 1 ? 3 : 0 }}>
                {a.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20 }}>
        <StatCard label="💰 MTD Spend"   value={money(spend.total_30d)} delta={`${Number(spend.total_calls || 0).toLocaleString()} calls`} color="var(--acid)" />
        <StatCard label="📈 Projected/mo" value={money(proj.projected_total)}
          delta={overBudget ? `${money(proj.over_by)} over budget` : `${money(Math.max(0, Number(proj.budget || 0) - Number(proj.projected_total || 0)))} under budget`}
          deltaDir={overBudget ? 'down' : 'up'} color="var(--red)" alert={overBudget} />
        <StatCard label="◎ Cost/1K tok"  value={costPer1k === null ? '—' : `$${costPer1k.toFixed(4)}`} delta={fmtTokens(totalTokens) + ' tokens'} color="var(--text)" />
        <StatCard label="♻ Waste"        value={money(retryCost)} delta={`${waste.waste_pct || 0}% of spend · ${Number(waste.retry_count || 0)} retries`} deltaDir="down" color="var(--red)" alert={retryCost > 0} />
        <StatCard label="⬡ Tokens/day"   value={fmtTokens(spend.avg_tokens_per_day)} delta={`${fmtTokens(totalTokens)} in range`} color="var(--green)" />
      </div>

      {/* Main grid */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 320px',gap:14,marginBottom:14 }}>

        {/* Model spend */}
        <Panel title="⬡ Spend by Model" subtitle="30d · click to drill down" action="All →">
          {models.length === 0
            ? <EmptyState icon="⬡" title="No model spend yet"
                desc="Connect a provider key or track events with ta.spend.track(), or reload sample data."
                action={
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
                    <Button variant="outline" size="sm" onClick={() => setShowConnect(true)}>+ Add Provider Key</Button>
                    <Button variant="ghost" size="sm" loading={reloading} onClick={handleReload}>Reload sample data</Button>
                  </div>
                }
              />
            : <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
                {models.map(m => {
                  const pColor = PROV_COLORS[m.provider] || 'var(--text3)'
                  return (
                    <div key={`${m.provider}/${m.model}`}
                      style={{ display:'grid',gridTemplateColumns:'8px 1fr auto auto auto',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--base2)',border:`1px solid ${m.spike?'rgba(255,77,109,0.3)':m.waste?'rgba(255,140,66,0.25)':'var(--border)'}`,borderRadius:8,cursor:'pointer',transition:'all var(--t-fast)' }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--acid-glow)'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=m.spike?'rgba(255,77,109,0.3)':m.waste?'rgba(255,140,66,0.25)':'var(--border)'}
                    >
                      <div style={{ width:8,height:8,borderRadius:'50%',background:pColor,boxShadow:`0 0 5px ${pColor}88` }} />
                      <div>
                        <div style={{ fontSize:11,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)' }}>{m.model}</div>
                        <div style={{ fontSize:9,color:'var(--text3)',marginTop:1 }}>{m.provider} · {(m.features || []).join(', ') || 'no feature'}</div>
                      </div>
                      <div style={{ display:'flex',gap:4 }}>
                        {m.spike && <span className="chip chip-red" style={{ fontSize:9 }}>⚡ Spike</span>}
                        {m.waste && <span className="chip chip-orange" style={{ fontSize:9 }}>♻ Waste</span>}
                        {!m.spike && !m.waste && <span className="chip chip-green" style={{ fontSize:9 }}>✓ Stable</span>}
                      </div>
                      <div style={{ fontSize:10,color:'var(--text2)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap' }}>{m.tokens_h}</div>
                      <div style={{ fontSize:12,fontWeight:700,color:m.spike?'var(--red)':'var(--acid)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap',textAlign:'right' }}>${m.cost}</div>
                    </div>
                  )
                })}
              </div>}
        </Panel>

        {/* Charts */}
        <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
          <Panel title="◇ Daily Spend by Provider" subtitle="30d stacked">
            {provRows.length === 0
              ? <EmptyState icon="◇" title="No spend yet" desc="Send your first event with ta.spend.track()" />
              : <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={provRows} margin={{ top:4,right:4,bottom:0,left:-20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="d" tick={{ fontSize:9,fill:'var(--text3)',fontFamily:'var(--font-mono)' }} tickLine={false} />
                    <YAxis tick={{ fontSize:9,fill:'var(--text3)' }} tickLine={false} tickFormatter={v=>`$${v}`} />
                    <Tooltip content={<ChartTip />} />
                    {provSeries.map(s => (
                      <Bar key={s.key} dataKey={s.key} stackId="s" fill={s.color} radius={[2,2,0,0]} name={s.name} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>}
          </Panel>
          <Panel title="◎ Cost / Successful Output" subtitle="By feature · trend">
            {featRows.length === 0
              ? <EmptyState icon="◎" title="No successful calls yet" desc="This chart plots cost per successful call, per feature, per day." />
              : <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={featRows} margin={{ top:4,right:4,bottom:0,left:-20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="d" tick={{ fontSize:9,fill:'var(--text3)',fontFamily:'var(--font-mono)' }} tickLine={false} />
                    <YAxis tick={{ fontSize:9,fill:'var(--text3)' }} tickLine={false} tickFormatter={v=>`$${v.toFixed(3)}`} />
                    <Tooltip content={<ChartTip />} />
                    {featSeries.map(s => (
                      <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5} dot={false} name={s.name} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>}
          </Panel>
        </div>

        {/* Projection */}
        <Panel title="📈 Spend Projection" subtitle="30d horizon">
          <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
            {[
              { icon:'📅', label:'Month to date', detail:`${money(proj.mtd_spend)} spent · ${proj.days_elapsed || 0} of ${proj.days_in_month || 30} days`, color:'var(--green)' },
              { icon:'📈', label:'Daily burn rate', detail:`${money(proj.daily_burn)}/day over ${proj.days_elapsed || 0} days`, color:'var(--acid)' },
              { icon: overBudget ? '⚠' : '✓', label:'Projected month-end',
                detail: overBudget
                  ? `${money(proj.projected_total)} total — ${money(proj.over_by)} over ${money(proj.budget)} budget`
                  : `${money(proj.projected_total)} total — within ${money(proj.budget)} budget`,
                color: overBudget ? 'var(--red)' : 'var(--green)', bold: overBudget },
              ...wasteItems.slice(0, 2).map(w => ({
                icon:'💡', label:`Waste: ${w.src}`, detail:`${money(w.cost)} on failed calls · ${w.pct}% of that model's calls`, color:'var(--green)',
              })),
            ].map((s, i, arr) => (
              <div key={i} style={{ display:'flex',gap:10,position:'relative',paddingBottom:2 }}>
                {i < arr.length-1 && <div style={{ position:'absolute',left:15,top:30,bottom:-2,width:1,background:'linear-gradient(to bottom, var(--border2), transparent)' }} />}
                <div style={{ width:30,height:30,borderRadius:'50%',border:`1.5px solid ${s.color}`,background:`${s.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,zIndex:1 }}>{s.icon}</div>
                <div style={{ flex:1,paddingBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:600,color:s.bold?'var(--red)':'var(--text)',fontFamily:'var(--font-mono)',marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:10,color:'var(--text2)',lineHeight:1.55 }}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Bottom grid */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14 }}>

        {/* Provider Health */}
        <Panel title="◈ Provider Health" action={<button onClick={()=>setShowConnect(true)} style={{ fontSize:11,color:'var(--acid)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--font-mono)' }}>+ Add key</button>}>
          {providers.length === 0
            ? <EmptyState icon="◈" title="No providers yet" desc="Traffic appears here once you send events, or connect a key." />
            : <table style={{ width:'100%',borderCollapse:'collapse' }}>
                <thead>
                  <tr>{['Provider','Efficiency','Calls','Err%','Status'].map(h=>(
                    <th key={h} style={{ textAlign:'left',fontSize:9,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'1.5px',paddingBottom:10,borderBottom:'1px solid var(--border)',fontWeight:600,fontFamily:'var(--font-mono)' }}>{h}</th>
                  ))}
                  </tr>
                </thead>
                <tbody>
                  {providers.map(p => {
                    const err = (100 - Number(p.efficiency ?? 100)).toFixed(1)
                    const color = PROV_COLORS[p.provider] || 'var(--text3)'
                    return (
                      <tr key={p.provider}>
                        <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                          <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                            <div style={{ width:22,height:22,borderRadius:5,background:'var(--base3)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                              <div style={{ width:8,height:8,borderRadius:'50%',background:color }} />
                            </div>
                            <span style={{ fontSize:11,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)' }}>{p.provider}</span>
                          </div>
                        </td>
                        <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                          <div style={{ height:4,background:'var(--base3)',borderRadius:2,width:50,overflow:'hidden',display:'inline-block',verticalAlign:'middle',marginRight:5 }}>
                            <div style={{ height:'100%',width:`${p.efficiency}%`,background:p.efficiency>85?'var(--green)':p.efficiency>70?'var(--acid)':'var(--red)',borderRadius:2 }} />
                          </div>
                          <span style={{ fontSize:10,color:p.efficiency>85?'var(--green)':p.efficiency>70?'var(--acid)':'var(--red)' }}>{p.efficiency}%</span>
                        </td>
                        <td style={{ fontSize:11,color:'var(--text2)',padding:'9px 0',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-mono)' }}>{Number(p.calls).toLocaleString()}</td>
                        <td style={{ fontSize:11,color:parseFloat(err)>3?'var(--red)':'var(--green)',padding:'9px 0',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-mono)' }}>{err}%</td>
                        <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                          <span className={`chip ${p.connected ? 'chip-green' : 'chip-muted'}`} style={{ fontSize:9 }}>{p.connected ? 'Key linked' : 'No key'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>}
        </Panel>

        {/* Spend by Feature */}
        <Panel title="◈ Spend by Feature" subtitle={`30d · ${money(totalSpend)} total`}>
          {features.length === 0
            ? <EmptyState icon="◈" title="No feature spend yet" desc="Send events with a feature name to break spend down here." />
            : <div style={{ display:'flex',flexDirection:'column',gap:9 }}>
                {features.map((f, i) => {
                  const cost = Number(f.cost || 0)
                  const pct = featureTotal > 0 ? Math.round(cost / featureTotal * 100) : 0
                  const color = FEATURE_COLORS[i % FEATURE_COLORS.length]
                  return (
                    <div key={f.feature} style={{ display:'flex',alignItems:'center',gap:8,fontSize:11 }}>
                      <div style={{ color:'var(--text2)',flex:1,fontFamily:'var(--font-mono)',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.feature}</div>
                      <div style={{ flex:2,height:6,background:'var(--base3)',borderRadius:3,overflow:'hidden' }}>
                        <div style={{ height:'100%',width:`${pct}%`,background:color,borderRadius:3,transition:'width 0.8s ease' }} />
                      </div>
                      <div style={{ color,fontWeight:600,width:64,textAlign:'right',fontSize:11,fontFamily:'var(--font-mono)' }}>{money(cost)}</div>
                    </div>
                  )
                })}
              </div>}
        </Panel>

        {/* Waste Finder */}
        <Panel title="♻ Waste Finder" action={wasteItems.length > 0 ? <span style={{ fontSize:11,color:'var(--acid)',cursor:'pointer',fontFamily:'var(--font-mono)' }}>Total → {money(retryCost)}</span> : null}>
          {wasteItems.length === 0
            ? <EmptyState icon="♻" title="No waste detected" desc="No failed calls in this window. Waste appears when success:false rows exist." />
            : <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {wasteItems.map((w,i) => (
                  <div key={i} style={{ background:'var(--base2)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',cursor:'pointer',transition:'border-color var(--t-fast)' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--acid-glow)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
                  >
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                      <span style={{ fontSize:10,fontWeight:700,color:'var(--acid)',fontFamily:'var(--font-mono)' }}>{w.src}</span>
                      <span style={{ fontSize:13,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-display)' }}>{money(w.cost)}</span>
                    </div>
                    <div style={{ fontSize:10,color:'var(--text2)',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{w.desc}</div>
                    <div style={{ marginTop:6,height:2,background:'var(--border)',borderRadius:1,overflow:'hidden' }}>
                      <div style={{ height:'100%',width:`${w.pct}%`,background:'linear-gradient(90deg,var(--red),var(--acid))',transition:'width 0.8s ease' }} />
                    </div>
                  </div>
                ))}
              </div>}
        </Panel>
      </div>

      {showConnect && <ConnectKeyModal onClose={() => setShowConnect(false)} />}
    </div>
  )
}
