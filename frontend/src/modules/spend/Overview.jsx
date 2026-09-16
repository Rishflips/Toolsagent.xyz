import { useState } from 'react'
import { StatCard, Panel, Button, EmptyState } from '../../components/ui/index'
import { clsx } from 'clsx'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--base2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{typeof p.value === 'number' && p.value < 10 ? `$${p.value.toFixed(2)}` : p.value}</span>
        </div>
      ))}
    </div>
  )
}

const DAILY = [
  { d:'M1',  openai:28, anthropic:12, google:8,  cohere:0  },
  { d:'M4',  openai:31, anthropic:14, google:9,  cohere:0  },
  { d:'M7',  openai:29, anthropic:13, google:8,  cohere:0  },
  { d:'M10', openai:34, anthropic:18, google:10, cohere:0  },
  { d:'M13', openai:38, anthropic:22, google:11, cohere:4  },
  { d:'M16', openai:36, anthropic:31, google:10, cohere:8  },
  { d:'M19', openai:41, anthropic:48, google:12, cohere:11 },
  { d:'M22', openai:44, anthropic:72, google:13, cohere:9  },
  { d:'M25', openai:39, anthropic:61, google:11, cohere:10 },
  { d:'M28', openai:42, anthropic:58, google:12, cohere:12 },
]

const OUTPUT_COST = [
  { d:'M1',  drafter:0.011, checkout:0.008, support:0.004 },
  { d:'M4',  drafter:0.012, checkout:0.008, support:0.003 },
  { d:'M7',  drafter:0.012, checkout:0.007, support:0.004 },
  { d:'M10', drafter:0.015, checkout:0.008, support:0.003 },
  { d:'M13', drafter:0.019, checkout:0.008, support:0.004 },
  { d:'M16', drafter:0.026, checkout:0.007, support:0.003 },
  { d:'M19', drafter:0.031, checkout:0.008, support:0.004 },
  { d:'M22', drafter:0.031, checkout:0.008, support:0.003 },
  { d:'M25', drafter:0.030, checkout:0.007, support:0.004 },
  { d:'M28', drafter:0.031, checkout:0.008, support:0.003 },
]

const MODELS = [
  { model:'claude-3-5-sonnet-20241022', provider:'anthropic', features:['email-drafter','research'], tokens:'18.4M', cost:'891.00', spike:true,  waste:false },
  { model:'gpt-4o',                     provider:'openai',    features:['checkout-flow'],            tokens:'12.1M', cost:'612.00', spike:false, waste:false },
  { model:'gpt-4o-mini',                provider:'openai',    features:['classify','triage'],        tokens:'41.2M', cost:'298.00', spike:false, waste:false },
  { model:'gemini-1.5-pro',             provider:'google',    features:['doc-summariser'],           tokens:'9.8M',  cost:'241.00', spike:false, waste:false },
  { model:'gpt-4-turbo',                provider:'openai',    features:['legacy-pipeline'],          tokens:'5.2M',  cost:'188.00', spike:false, waste:true  },
  { model:'command-r-plus',             provider:'cohere',    features:['rag-pipeline'],             tokens:'3.1M',  cost:'121.00', spike:false, waste:false, new:true },
]

const WASTE = [
  { src:'email-drafter · claude-3-5-sonnet', saving:310, desc:'Oversized system prompts avg 8,241 tokens. Full policy doc on every call. Move to RAG lookup.', pct:91 },
  { src:'legacy-pipeline · gpt-4-turbo',     saving:141, desc:'18% retry rate from context_length_exceeded. Inputs not truncated before submission.',          pct:41 },
  { src:'support-bot · gpt-4o',              saving:62,  desc:'Duplicate intent classification same ticket ID within 30s. Missing response cache layer.',       pct:18 },
]

const PROV_COLORS = { anthropic:'#c9a96e', openai:'#10a37f', google:'#4285f4', cohere:'#9b59b6' }

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

  return (
    <div style={{ padding: 24 }}>

      {/* Spike Alert */}
      <div style={{ background:'var(--red-dim)',border:'1px solid rgba(255,77,109,0.3)',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,marginBottom:20,animation:'fadeUp 0.4s ease' }}>
        <span style={{ fontSize:16 }}>⚡</span>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:13,color:'var(--red)' }}>SPIKE: Anthropic claude-3-5-sonnet up 340% in 2h</div>
          <div style={{ fontSize:11,color:'var(--text2)',marginTop:2,fontFamily:'var(--font-mono)' }}>email-drafter sending 8,241-token prompts · $148 today · projected $1,340/mo if unfixed</div>
        </div>
        <Button variant="danger" size="sm">Inspect →</Button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20 }}>
        <StatCard label="💰 MTD Spend"   value="$2,351" delta="↑ 28% vs last month"  deltaDir="down" color="var(--acid)" />
        <StatCard label="📈 Projected/mo" value="$2,841" delta="$490 over budget"      deltaDir="down" color="var(--red)" alert />
        <StatCard label="◎ Cost/1K out"  value="$3.14"  delta="↓ 6% efficiency gain"  deltaDir="up"   color="var(--text)" />
        <StatCard label="♻ Waste"        value="$341"   delta="14.5% of total spend"  deltaDir="down" color="var(--red)" alert />
        <StatCard label="⬡ Tokens/day"   value="48.2M"  delta="↑ 11% growth"          deltaDir="up"   color="var(--green)" />
      </div>

      {/* Main grid */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 320px',gap:14,marginBottom:14 }}>

        {/* Model spend */}
        <Panel title="⬡ Spend by Model" subtitle="30d · click to drill down" action="All →">
          <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
            {MODELS.map(m => {
              const pColor = PROV_COLORS[m.provider] || 'var(--text3)'
              return (
                <div key={m.model}
                  style={{ display:'grid',gridTemplateColumns:'8px 1fr auto auto auto',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--base2)',border:`1px solid ${m.spike?'rgba(255,77,109,0.3)':m.waste?'rgba(255,140,66,0.25)':'var(--border)'}`,borderRadius:8,cursor:'pointer',transition:'all var(--t-fast)' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--acid-glow)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=m.spike?'rgba(255,77,109,0.3)':m.waste?'rgba(255,140,66,0.25)':'var(--border)'}
                >
                  <div style={{ width:8,height:8,borderRadius:'50%',background:pColor,boxShadow:`0 0 5px ${pColor}88` }} />
                  <div>
                    <div style={{ fontSize:11,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)' }}>{m.model}</div>
                    <div style={{ fontSize:9,color:'var(--text3)',marginTop:1 }}>{m.provider} · {m.features.join(', ')}</div>
                  </div>
                  <div style={{ display:'flex',gap:4 }}>
                    {m.spike && <span className="chip chip-red" style={{ fontSize:9 }}>⚡ Spike</span>}
                    {m.waste && <span className="chip chip-orange" style={{ fontSize:9 }}>♻ Waste</span>}
                    {m.new   && <span className="chip chip-purple" style={{ fontSize:9 }}>◈ New</span>}
                    {!m.spike && !m.waste && !m.new && <span className="chip chip-green" style={{ fontSize:9 }}>✓ Stable</span>}
                  </div>
                  <div style={{ fontSize:10,color:'var(--text2)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap' }}>{m.tokens}</div>
                  <div style={{ fontSize:12,fontWeight:700,color:m.spike?'var(--red)':'var(--acid)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap',textAlign:'right' }}>${m.cost}</div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* Charts */}
        <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
          <Panel title="◇ Daily Spend by Provider" subtitle="30d stacked">
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={DAILY} margin={{ top:4,right:4,bottom:0,left:-20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" tick={{ fontSize:9,fill:'var(--text3)',fontFamily:'var(--font-mono)' }} tickLine={false} />
                <YAxis tick={{ fontSize:9,fill:'var(--text3)' }} tickLine={false} tickFormatter={v=>`$${v}`} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="anthropic" stackId="s" fill="rgba(201,169,110,0.75)" radius={[0,0,0,0]} name="Anthropic" />
                <Bar dataKey="openai"    stackId="s" fill="rgba(16,163,127,0.65)"  radius={[0,0,0,0]} name="OpenAI" />
                <Bar dataKey="google"    stackId="s" fill="rgba(66,133,244,0.55)"  radius={[0,0,0,0]} name="Google" />
                <Bar dataKey="cohere"    stackId="s" fill="rgba(155,89,182,0.55)"  radius={[2,2,0,0]} name="Cohere" />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="◎ Cost / Successful Output" subtitle="By feature · trend">
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={OUTPUT_COST} margin={{ top:4,right:4,bottom:0,left:-20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" tick={{ fontSize:9,fill:'var(--text3)',fontFamily:'var(--font-mono)' }} tickLine={false} />
                <YAxis tick={{ fontSize:9,fill:'var(--text3)' }} tickLine={false} tickFormatter={v=>`$${v.toFixed(3)}`} />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="drafter"  stroke="var(--red)"   strokeWidth={2} dot={false} name="email-drafter" />
                <Line type="monotone" dataKey="checkout" stroke="var(--acid)"  strokeWidth={1.5} dot={false} name="checkout-flow" />
                <Line type="monotone" dataKey="support"  stroke="var(--green)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="support-bot" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* Projection */}
        <Panel title="📈 Spend Projection" subtitle="30d horizon">
          <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
            {[
              { type:'now',    icon:'📅', label:'Month to date', detail:'$2,351 spent · 18 of 30 days', color:'var(--green)' },
              { type:'trend',  icon:'📈', label:'7-day burn rate', detail:'$134/day · up from $94/day (+42%)', color:'var(--acid)' },
              { type:'danger', icon:'⚠',  label:'Projected month-end', detail:'$2,841 total — $490 over $2,350 budget', color:'var(--red)', bold:true },
              { type:'tip',    icon:'💡', label:'Fix: trim email-drafter prompts', detail:'8.2K → 2.1K tokens via RAG · saves $310/mo', color:'var(--green)' },
              { type:'tip',    icon:'💡', label:'Fix: route legacy → gpt-4o-mini', detail:'93% quality at 12% cost · saves $140/mo', color:'var(--green)' },
            ].map((s, i, arr) => (
              <div key={i} style={{ display:'flex',gap:10,position:'relative',paddingBottom:2 }}>
                {i < arr.length-1 && <div style={{ position:'absolute',left:15,top:30,bottom:-2,width:1,background:'linear-gradient(to bottom, var(--border2), transparent)' }} />}
                <div style={{ width:30,height:30,borderRadius:'50%',border:`1.5px solid ${s.color}`,background:`${s.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,flexShrink:0,zIndex:1 }}>{s.icon}</div>
                <div style={{ flex:1,paddingBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:600,color:s.bold?'var(--red)':s.type==='tip'?'var(--green)':'var(--text)',fontFamily:'var(--font-mono)',marginBottom:2 }}>{s.label}</div>
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
          <table style={{ width:'100%',borderCollapse:'collapse' }}>
            <thead>
              <tr>{['Provider','Efficiency','Calls/d','Err%','Status'].map(h=>(
                <th key={h} style={{ textAlign:'left',fontSize:9,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'1.5px',paddingBottom:10,borderBottom:'1px solid var(--border)',fontWeight:600,fontFamily:'var(--font-mono)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {[
                { name:'OpenAI',    logo:'🟢', eff:88, calls:4821, err:'1.2%', status:'Clean',  sc:'green',  bg:'rgba(16,163,127,.15)' },
                { name:'Anthropic', logo:'🟡', eff:61, calls:1203, err:'3.8%', status:'Spike',  sc:'red',    bg:'rgba(201,169,110,.15)' },
                { name:'Google',    logo:'🔵', eff:94, calls:892,  err:'0.6%', status:'Clean',  sc:'green',  bg:'rgba(66,133,244,.12)'  },
                { name:'Cohere',    logo:'🟣', eff:79, calls:341,  err:'0.9%', status:'New',    sc:'purple', bg:'rgba(155,89,182,.12)'  },
              ].map(p => (
                <tr key={p.name}>
                  <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:7 }}>
                      <div style={{ width:22,height:22,borderRadius:5,background:p.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11 }}>{p.logo}</div>
                      <span style={{ fontSize:11,fontWeight:600,color:'var(--text)',fontFamily:'var(--font-mono)' }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                    <div style={{ height:4,background:'var(--base3)',borderRadius:2,width:50,overflow:'hidden',display:'inline-block',verticalAlign:'middle',marginRight:5 }}>
                      <div style={{ height:'100%',width:`${p.eff}%`,background:p.eff>85?'var(--green)':p.eff>70?'var(--acid)':'var(--red)',borderRadius:2 }} />
                    </div>
                    <span style={{ fontSize:10,color:p.eff>85?'var(--green)':p.eff>70?'var(--acid)':'var(--red)' }}>{p.eff}%</span>
                  </td>
                  <td style={{ fontSize:11,color:'var(--text2)',padding:'9px 0',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-mono)' }}>{p.calls.toLocaleString()}</td>
                  <td style={{ fontSize:11,color:parseFloat(p.err)>3?'var(--red)':'var(--green)',padding:'9px 0',borderBottom:'1px solid var(--border)',fontFamily:'var(--font-mono)' }}>{p.err}</td>
                  <td style={{ padding:'9px 0',borderBottom:'1px solid var(--border)' }}>
                    <span className={`chip chip-${p.sc}`} style={{ fontSize:9 }}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* Spend by Feature */}
        <Panel title="◈ Spend by Feature" subtitle="30d · $2,351 total">
          <div style={{ display:'flex',flexDirection:'column',gap:9 }}>
            {[
              { name:'email-drafter', pct:38, cost:'$891', color:'var(--red)' },
              { name:'checkout-flow', pct:26, cost:'$612', color:'var(--acid)' },
              { name:'support-bot',   pct:18, cost:'$423', color:'var(--green)' },
              { name:'doc-summariser',pct:10, cost:'$241', color:'var(--purple)' },
              { name:'rag-pipeline',  pct:8,  cost:'$184', color:'var(--text3)' },
            ].map(f => (
              <div key={f.name} style={{ display:'flex',alignItems:'center',gap:8,fontSize:11 }}>
                <div style={{ color:'var(--text2)',flex:1,fontFamily:'var(--font-mono)',fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.name}</div>
                <div style={{ flex:2,height:6,background:'var(--base3)',borderRadius:3,overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${f.pct}%`,background:f.color,borderRadius:3,transition:'width 0.8s ease' }} />
                </div>
                <div style={{ color:f.color,fontWeight:600,width:44,textAlign:'right',fontSize:11,fontFamily:'var(--font-mono)' }}>{f.cost}</div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Waste Finder */}
        <Panel title="♻ Waste Finder" action={<span style={{ fontSize:11,color:'var(--acid)',cursor:'pointer',fontFamily:'var(--font-mono)' }}>Fix all → $513</span>}>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {WASTE.map((w,i) => (
              <div key={i} style={{ background:'var(--base2)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',cursor:'pointer',transition:'border-color var(--t-fast)' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='var(--acid-glow)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
              >
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                  <span style={{ fontSize:10,fontWeight:700,color:'var(--acid)',fontFamily:'var(--font-mono)' }}>{w.src}</span>
                  <span style={{ fontSize:13,fontWeight:800,color:'var(--red)',fontFamily:'var(--font-display)' }}>${w.saving}/mo</span>
                </div>
                <div style={{ fontSize:10,color:'var(--text2)',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden' }}>{w.desc}</div>
                <div style={{ marginTop:6,height:2,background:'var(--border)',borderRadius:1,overflow:'hidden' }}>
                  <div style={{ height:'100%',width:`${w.pct}%`,background:'linear-gradient(90deg,var(--red),var(--acid))',transition:'width 0.8s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {showConnect && <ConnectKeyModal onClose={() => setShowConnect(false)} />}
    </div>
  )
}
