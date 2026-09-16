-- ToolsAgent unified schema
-- Modules: Observe · Spend · Deploy
-- Version: 1.0.0

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ORGS & AUTH ──────────────────────────────────────────────────
CREATE TABLE orgs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  plan         TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','business')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key_hash   TEXT NOT NULL UNIQUE,  -- SHA-256 of full key, never store plain
  key_prefix TEXT NOT NULL,         -- first 12 chars for display (ts_xxxxx...)
  label      TEXT NOT NULL DEFAULT 'default',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_used  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ── OBSERVE MODULE ───────────────────────────────────────────────
CREATE TABLE traces (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent         TEXT NOT NULL,
  task          TEXT NOT NULL,
  model         TEXT NOT NULL DEFAULT 'unknown',
  status        TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','warning')),
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  flags         TEXT[] NOT NULL DEFAULT '{}',
  steps         JSONB NOT NULL DEFAULT '[]',
  metadata      JSONB NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_traces_org     ON traces(org_id, started_at DESC);
CREATE INDEX idx_traces_agent   ON traces(org_id, agent, started_at DESC);
CREATE INDEX idx_traces_status  ON traces(org_id, status);
CREATE INDEX idx_traces_flags   ON traces USING GIN(flags);

-- Partition traces by month for performance at scale
-- (simplified: just index for now, partition when >1M rows)

CREATE TABLE hallucinations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  trace_id    UUID REFERENCES traces(id) ON DELETE SET NULL,
  agent       TEXT NOT NULL,
  confidence  NUMERIC(4,2) NOT NULL,
  excerpt     TEXT NOT NULL,
  reviewed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_halluc_org ON hallucinations(org_id, created_at DESC);

-- ── SPEND MODULE ─────────────────────────────────────────────────
CREATE TABLE spend_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  feature       TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  success       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spend_org      ON spend_events(org_id, created_at DESC);
CREATE INDEX idx_spend_provider ON spend_events(org_id, provider, created_at DESC);
CREATE INDEX idx_spend_feature  ON spend_events(org_id, feature, created_at DESC);
CREATE INDEX idx_spend_model    ON spend_events(org_id, model, created_at DESC);

CREATE TABLE provider_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  encrypted_key   TEXT NOT NULL,  -- AES-256-GCM encrypted
  label           TEXT NOT NULL DEFAULT 'default',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_keys_org ON provider_keys(org_id);

CREATE TABLE alert_rules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  spike_multiplier NUMERIC(4,1) NOT NULL DEFAULT 2.0,
  budget_limit     NUMERIC(10,2) NOT NULL DEFAULT 100.0,
  slack_webhook    TEXT,
  email_alerts     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DEPLOY MODULE ────────────────────────────────────────────────
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  model         TEXT NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  system_prompt TEXT NOT NULL DEFAULT '',
  github_url    TEXT,
  version       TEXT NOT NULL DEFAULT 'v1.0.0',
  status        TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','error','stopped')),
  guardrails    JSONB NOT NULL DEFAULT '{"pii_detection":true,"loop_breaker":true,"cost_limit":0.50}',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

CREATE INDEX idx_agents_org ON agents(org_id);

CREATE TABLE agent_runs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  duration_ms INTEGER,
  cost_usd    NUMERIC(12,6),
  blocks      INTEGER NOT NULL DEFAULT 0,
  steps       JSONB NOT NULL DEFAULT '[]',
  output      TEXT,
  error_msg   TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_runs_agent  ON agent_runs(agent_id, started_at DESC);
CREATE INDEX idx_runs_org    ON agent_runs(org_id, started_at DESC);
CREATE INDEX idx_runs_status ON agent_runs(org_id, status);

CREATE TABLE guardrail_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  agent_id   UUID REFERENCES agents(id) ON DELETE SET NULL,
  run_id     UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  rule       TEXT NOT NULL,
  triggered  BOOLEAN NOT NULL DEFAULT TRUE,
  confidence NUMERIC(4,2),
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guardrail events are NEVER purged — permanent audit log
CREATE INDEX idx_guardrail_org   ON guardrail_events(org_id, created_at DESC);
CREATE INDEX idx_guardrail_agent ON guardrail_events(agent_id, created_at DESC);

-- ── DAILY SPEND SUMMARY (materialized for dashboard perf) ────────
CREATE TABLE daily_spend_summary (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  provider    TEXT NOT NULL,
  total_cost  NUMERIC(12,6) NOT NULL DEFAULT 0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, date, provider)
);

CREATE INDEX idx_daily_summary_org ON daily_spend_summary(org_id, date DESC);

-- ── HELPER FUNCTION: update updated_at ──────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_updated_at    BEFORE UPDATE ON orgs    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_agents_updated_at  BEFORE UPDATE ON agents  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_alerts_updated_at  BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
