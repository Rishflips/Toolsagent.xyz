# @toolsagent/sdk

Unified JavaScript SDK for **ToolsAgent** — Observe, Spend, and Deploy your AI agents from one place.

Zero runtime dependencies. Works with plain Node.js, Next.js, Express, or anywhere `fetch` is available (Node 18+).

---

## Install

```bash
npm install @toolsagent/sdk
```

---

## Quick start

```js
const { ToolsAgent } = require('@toolsagent/sdk')

const ta = new ToolsAgent(process.env.TOOLSAGENT_API_KEY)

// Your API key starts with `ts_` — create an account in your ToolsAgent
// dashboard and copy it from the API Keys panel.
```

Point at a self-hosted instance with the `baseUrl` option:

```js
const ta = new ToolsAgent(process.env.TOOLSAGENT_API_KEY, {
  baseUrl: 'https://your-toolsagent-host.example.com',
})
```

---

## Observe — traces and agent health

```js
const result = await ta.observe.wrap(
  () => myAgent.run(task),
  { agent: 'research-agent', task: 'summarise', model: 'claude-3-5-sonnet-20241022' }
)
```

Log a trace directly:

```js
await ta.observe.trace({
  agent: 'research-agent',
  task: 'summarise',
  model: 'claude-3-5-sonnet-20241022',
  status: 'success',
  duration_ms: 1240,
  input_tokens: 820,
  output_tokens: 210,
  cost_usd: 0.0043,
})
```

## Spend — cost tracking

```js
// Wrap a provider call and record its cost automatically
await ta.spend.track({
  provider: 'openai',          // openai | anthropic | google | cohere | mistral | groq
  model: 'gpt-4o',
  feature: 'email-drafter',
  input_tokens: 1200,
  output_tokens: 300,
  cost_usd: 0.0052,
})
```

## Deploy — run a registered agent

```js
const { run } = await ta.deploy.run('ag_your_agent_id', 'Research Q3 competitors')
```

---

## Configuration

| Option | Default | Description |
|---|---|---|
| `baseUrl` | `http://localhost:4000` | Your ToolsAgent API endpoint |
| `timeout` | `30000` | Request timeout in milliseconds |
| `debug` | `false` | Log requests to the console |
| `retries` | `2` | Retry attempts on network failure |

---

## Error handling

```js
try {
  await ta.spend.track({ /* ... */ })
} catch (err) {
  if (err.status === 401) console.error('Bad API key')
  else if (err.status === 429) console.error('Rate limited — back off')
  else console.error('Unexpected:', err.message)
}
```

---

## Self-hosting

ToolsAgent is MIT-licensed and runs entirely on your own infrastructure — no SaaS account required. See the main repo README for the one-command Docker setup.

---

## License

MIT
