# ToolsAgent

**Open source AI agent console.** Observe · Spend · Deploy your AI agents in one unified dashboard.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/Rishflips/Toolsagent.xyz)](https://github.com/Rishflips/Toolsagent.xyz)

---

## What is ToolsAgent?

Three essential tools for AI agent developers — merged into one console:

| Module | What it does |
|--------|-------------|
| **◈ Observe** | Real-time traces, hallucination detection, agent health, latency |
| **◇ Spend** | Cost tracking across providers, waste finder, spike alerts, projections |
| **⬡ Deploy** | Deploy agents, run history, guardrails, guardrail audit log |

---

## Self-host in one command

```bash
git clone https://github.com/Rishflips/Toolsagent.xyz
cd Toolsagent.xyz
docker compose up
```

Secrets (`JWT_SECRET` and `ENCRYPTION_SECRET`) are generated and persisted automatically on first boot. Custom configuration can optionally be set via `.env` (see `.env.example`).

Open **http://localhost:3000** → Create account → Get API key → Start tracking.

No external dependencies. No SaaS required. Runs on any machine with Docker.

---

## SDK

```bash
npm install @toolsagent/sdk
# or
pip install toolsagent
```

```javascript
const { ToolsAgent } = require('@toolsagent/sdk')

const ta = new ToolsAgent(process.env.TOOLSAGENT_API_KEY)

// Observe — auto-trace any LLM call
const result = await ta.observe.wrap(
  () => anthropic.messages.create({ model: 'claude-3-5-sonnet-20241022', ... }),
  { agent: 'research-agent', task: 'summarise', model: 'claude-3-5-sonnet-20241022' }
)

// Spend — track cost
await ta.spend.wrapAnthropic(fn, 'email-drafter', 'claude-3-5-sonnet-20241022')

// Deploy — run an agent
const { run } = await ta.deploy.run('ag_your_agent_id', 'Research Q3 competitors')
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 · Vite · Recharts |
| Backend | Node.js · Express · WebSocket |
| Database | PostgreSQL 16 |
| Auth | JWT (RS256) |
| Deploy | Docker Compose |
| SDK | Pure Node.js (zero deps) |

---

## Design

**Terminal Glass** design system:
- `#E8FF47` chartreuse accent — phosphor screen energy, not generic cyan
- `Space Grotesk` display · `JetBrains Mono` data · `Inter` body
- Dark/light mode with system preference detection
- Neural Pulse line — live oscilloscope reflecting real event rate
- Collapsible sidebar with per-module accent colors

---

## Project Structure

```
toolsagent/
├── frontend/          # React 18 + Vite
│   └── src/
│       ├── modules/
│       │   ├── observe/   # Traces, hallucinations, drift
│       │   ├── spend/     # Cost, waste, projections
│       │   └── deploy/    # Agents, runs, guardrails
│       ├── components/    # Shared UI + layout
│       └── hooks/         # useApi, useWebSocket, useTheme
├── backend/           # Node.js + Express + WebSocket
│   ├── src/server.js  # Unified server — all routes
│   └── db/schema.sql  # PostgreSQL schema
├── sdk/               # @toolsagent/sdk
│   └── src/index.js   # Observe · Spend · Deploy clients
├── docker-compose.yml # One command to run everything
└── .env.example       # Environment template
```

---

## Contributing

1. Fork the repo
2. `git clone` your fork
3. `docker compose up`
4. Create a feature branch: `git checkout -b feat/your-feature`
5. Open a PR

All contributions welcome — bug fixes, new features, documentation, design improvements.

**Note:** several modules currently render placeholder screens (Trace Explorer, Hallucination Review, Spend by Model/Feature, Projections, Run History, Guardrail Builder, API Keys). The backend routes for most of these already exist — wiring the UI to them is the best place to start contributing.

---

## Roadmap

- [ ] Python SDK (`pip install toolsagent`)
- [ ] LangChain + CrewAI native integration
- [ ] ContextOS module (knowledge layer / RAG)
- [ ] FlowPilot module (workflow automation)
- [ ] Team workspaces + RBAC
- [ ] Trace replay — step through agent decisions
- [ ] Agent marketplace — share + deploy community agents
- [ ] Grafana plugin for existing observability stacks
- [ ] Wire placeholder module screens to the existing backend routes
- [ ] Email verification + password reset
- [ ] Code-split the frontend bundle (currently ~637 kB)

---

## License

MIT — use it, fork it, ship it, build on it.

---

Built by [@Rishflips](https://github.com/Rishflips) · [toolsagent.xyz](https://toolsagent.xyz)
