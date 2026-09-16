'use strict';

const express      = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { Pool }     = require('pg');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const { v4: uuid } = require('uuid');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws/traces' });

// ── CONFIG ────────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 4000;
const FRONTEND    = process.env.FRONTEND_URL || 'http://localhost:3000';
const DB_URL      = process.env.DATABASE_URL || 'postgresql://toolsagent:toolsagent_dev@localhost:5432/toolsagent';

// Fail closed on secrets. A default secret published in this repo would let
// anyone forge a valid JWT for every deployment that forgot to set one.
const INSECURE_SECRETS = new Set([
  'change_this_in_production_min_32_chars',
  'change_this_in_production_min_32_chars_please',
  'change_this_in_production_32chars!',
  'change_this_in_production_32chars',
  'secret', 'changeme', 'password',
]);

function requireSecret(name, value, { minLength = 32 } = {}) {
  if (!value) {
    console.error(
      `\nFATAL: ${name} is not set.\n` +
      `Generate one with:\n  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n` +
      `then set ${name} in your .env file.\n`
    );
    process.exit(1);
  }
  if (INSECURE_SECRETS.has(value) || value.length < minLength) {
    console.error(
      `\nFATAL: ${name} is insecure (too short, or a placeholder value from .env.example).\n` +
      `It must be a random string of at least ${minLength} characters.\n` +
      `Generate one with:\n  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\n`
    );
    process.exit(1);
  }
  return value;
}

const JWT_SECRET  = requireSecret('JWT_SECRET',  process.env.JWT_SECRET);
const ENC_SECRET  = requireSecret('ENCRYPTION_SECRET', process.env.ENCRYPTION_SECRET);

// ── DATABASE ──────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DB_URL, max: 20 });
const db   = (text, params) => pool.query(text, params);

// ── ENCRYPTION ───────────────────────────────────────────────────
const ENC_KEY = crypto.scryptSync(ENC_SECRET, 'toolsagent_salt', 32);

function encrypt(text) {
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, encHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

// ── API KEY HELPERS ──────────────────────────────────────────────
function generateApiKey() {
  const raw    = `ts_${crypto.randomBytes(24).toString('hex')}`;
  const hash   = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: FRONTEND, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Auth rate limit
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests' } });

// API key rate limit
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, message: { error: 'Rate limit exceeded' } });

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authorization required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.org  = { id: decoded.orgId };
    req.user = { id: decoded.userId, email: decoded.email, name: decoded.name };
    next();
  } catch (_) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || !key.startsWith('ts_')) return res.status(401).json({ error: 'API key required' });

  try {
    const hash = hashKey(key);
    const { rows } = await db(
      `SELECT k.org_id, o.plan FROM api_keys k JOIN orgs o ON o.id = k.org_id
       WHERE k.key_hash = $1 AND k.active = true`, [hash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid API key' });

    // Update last_used async
    db(`UPDATE api_keys SET last_used = NOW() WHERE key_hash = $1`, [hash]).catch(() => {});

    req.org  = { id: rows[0].org_id, plan: rows[0].plan };
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Auth error' });
  }
}

// Accept both JWT and API key
async function requireAnyAuth(req, res, next) {
  if (req.headers['x-api-key']) return requireApiKey(req, res, next);
  return requireAuth(req, res, next);
}

// ── HELPERS ───────────────────────────────────────────────────────
function ok(res, data, status = 200) { return res.status(status).json(data); }
function err(res, msg, status = 400) { return res.status(status).json({ error: msg }); }

const KEY_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

// ── HEALTH ────────────────────────────────────────────────────────
app.get('/health', (_, res) => ok(res, { status: 'ok', version: '1.0.0', ts: new Date().toISOString() }));

// ── AUTH ROUTES ───────────────────────────────────────────────────
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return err(res, 'name, email, password required');
  if (password.length < 8) return err(res, 'Password must be at least 8 characters');

  try {
    const hash = await bcrypt.hash(password, 12);
    const orgId  = uuid();
    const userId = uuid();

    await db('BEGIN');

    // Create org
    await db(`INSERT INTO orgs (id, name, email) VALUES ($1, $2, $3)`, [orgId, name, email]);

    // Create user
    await db(
      `INSERT INTO users (id, org_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5,'owner')`,
      [userId, orgId, name, email, hash]
    );

    // Generate API key
    const { raw, hash: kHash, prefix } = generateApiKey();
    await db(
      `INSERT INTO api_keys (id, org_id, key_hash, key_prefix, label) VALUES ($1,$2,$3,$4,'default')`,
      [uuid(), orgId, kHash, prefix]
    );

    // Create default alert rule
    await db(`INSERT INTO alert_rules (id, org_id) VALUES ($1, $2)`, [uuid(), orgId]);

    await db('COMMIT');

    const token = jwt.sign({ orgId, userId, email, name }, JWT_SECRET, { expiresIn: '30d' });
    ok(res, { token, user: { id: userId, name, email, plan: 'free' }, api_key: raw }, 201);
  } catch (e) {
    await db('ROLLBACK');
    if (e.code === '23505') return err(res, 'Email already registered');
    console.error('Signup error:', e.message);
    err(res, 'Signup failed', 500);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return err(res, 'email and password required');

  try {
    const { rows } = await db(
      `SELECT u.id, u.name, u.email, u.password_hash, u.org_id, o.plan
       FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.email = $1`, [email]
    );
    if (!rows.length) return err(res, 'Invalid credentials', 401);

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return err(res, 'Invalid credentials', 401);

    const { id, name, org_id, plan } = rows[0];
    const token = jwt.sign({ orgId: org_id, userId: id, email, name }, JWT_SECRET, { expiresIn: '30d' });
    ok(res, { token, user: { id, name, email, plan } });
  } catch (e) {
    err(res, 'Login failed', 500);
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db(
      `SELECT u.id, u.name, u.email, u.role, o.plan, o.id as org_id
       FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.id = $1`, [req.user.id]
    );
    if (!rows.length) return err(res, 'Not found', 404);
    ok(res, { user: rows[0] });
  } catch (e) {
    err(res, 'Error', 500);
  }
});

// ── OBSERVE ROUTES ────────────────────────────────────────────────
app.post('/api/v1/observe/traces', apiLimiter, requireAnyAuth, async (req, res) => {
  const { agent, task, model, status, duration_ms, cost_usd, input_tokens, output_tokens, flags, steps, metadata } = req.body;
  if (!agent) return err(res, 'agent is required');
  if (!task)  return err(res, 'task is required');

  try {
    const id = uuid();
    await db(
      `INSERT INTO traces (id, org_id, agent, task, model, status, duration_ms, cost_usd, input_tokens, output_tokens, flags, steps, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, req.org.id, agent, task, model||'unknown', status||'success',
       Math.max(0,parseInt(duration_ms)||0), Math.max(0,parseFloat(cost_usd)||0),
       Math.max(0,parseInt(input_tokens)||0), Math.max(0,parseInt(output_tokens)||0),
       flags||[], JSON.stringify(steps||[]), JSON.stringify(metadata||{})]
    );

    // Broadcast to WebSocket clients for this org
    broadcastToOrg(req.org.id, { type: 'trace', data: { id, agent, task, model, status, cost_usd, duration_ms, flags } });

    ok(res, { logged: true, id });
  } catch (e) {
    err(res, 'Failed to log trace', 500);
  }
});

app.get('/api/v1/observe/traces', apiLimiter, requireAnyAuth, async (req, res) => {
  const { limit = 50, offset = 0, agent, status } = req.query;
  try {
    let q = `SELECT id, agent, task, model, status, duration_ms, cost_usd, flags, started_at FROM traces WHERE org_id = $1`;
    const params = [req.org.id];
    if (agent)  { params.push(agent);  q += ` AND agent = $${params.length}`; }
    if (status) { params.push(status); q += ` AND status = $${params.length}`; }
    q += ` ORDER BY started_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(Math.min(parseInt(limit)||50, 200), Math.max(parseInt(offset)||0, 0));
    const { rows } = await db(q, params);
    ok(res, { traces: rows });
  } catch (e) {
    err(res, 'Failed to fetch traces', 500);
  }
});

app.get('/api/v1/observe/dashboard', apiLimiter, requireAnyAuth, async (req, res) => {
  try {
    const orgId = req.org.id;
    const [totalR, flagsR, costR, agentsR] = await Promise.all([
      db(`SELECT COUNT(*) as total, AVG(duration_ms) as avg_lat FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h'`, [orgId]),
      db(`SELECT COUNT(*) as flags FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h' AND status != 'success'`, [orgId]),
      db(`SELECT COALESCE(SUM(cost_usd),0) as total FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h'`, [orgId]),
      db(`SELECT agent, COUNT(*) as runs, AVG(cost_usd) as avg_cost, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END)*100.0/COUNT(*) as health FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '1h' GROUP BY agent`, [orgId]),
    ]);

    ok(res, {
      traces_6h:    parseInt(totalR.rows[0]?.total || 0),
      avg_latency:  `${Math.round(parseFloat(totalR.rows[0]?.avg_lat || 0) / 1000 * 10) / 10}s`,
      success_rate: totalR.rows[0]?.total > 0
        ? `${(100 - parseFloat(flagsR.rows[0]?.flags || 0) / parseFloat(totalR.rows[0]?.total) * 100).toFixed(1)}%`
        : '100%',
      halluc_rate:  '0.00%',
      cost_6h:      `$${parseFloat(costR.rows[0]?.total || 0).toFixed(2)}`,
      agents:       agentsR.rows,
    });
  } catch (e) {
    err(res, 'Dashboard error', 500);
  }
});

// ── SPEND ROUTES ──────────────────────────────────────────────────
app.post('/api/v1/spend/events', apiLimiter, requireAnyAuth, async (req, res) => {
  const { provider, model, feature, input_tokens, output_tokens, cost_usd, success, metadata } = req.body;
  if (!provider) return err(res, 'provider is required');
  if (!model)    return err(res, 'model is required');
  if (!feature)  return err(res, 'feature is required');

  const VALID = new Set(['openai','anthropic','google','cohere','mistral','groq']);
  if (!VALID.has(String(provider).toLowerCase())) return err(res, 'Invalid provider');

  try {
    await db(
      `INSERT INTO spend_events (id, org_id, provider, model, feature, input_tokens, output_tokens, cost_usd, success, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uuid(), req.org.id, provider, model, feature,
       Math.max(0, parseInt(input_tokens)||0), Math.max(0, parseInt(output_tokens)||0),
       Math.max(0, parseFloat(cost_usd)||0), success !== false,
       JSON.stringify(metadata||{})]
    );
    ok(res, { logged: true });
  } catch (e) {
    err(res, 'Failed to log event', 500);
  }
});

app.get('/api/v1/spend/dashboard', apiLimiter, requireAnyAuth, async (req, res) => {
  const range = req.query.range || '30d';
  const interval = range === '7d' ? '7 days' : range === '90d' ? '90 days' : '30 days';

  try {
    const orgId = req.org.id;
    const [totR, provR, featR, wasteR, projR] = await Promise.all([
      db(`SELECT COALESCE(SUM(cost_usd),0) as total, COUNT(*) as calls, COALESCE(SUM(input_tokens+output_tokens),0) as tokens FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'`, [orgId]),
      db(`SELECT provider, COALESCE(SUM(cost_usd),0) as cost, COUNT(*) as calls, COALESCE(SUM(input_tokens+output_tokens),0) as tokens FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}' GROUP BY provider ORDER BY cost DESC`, [orgId]),
      db(`SELECT feature, COALESCE(SUM(cost_usd),0) as cost, COUNT(*) as calls FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}' GROUP BY feature ORDER BY cost DESC`, [orgId]),
      db(`SELECT COUNT(*) as retry_count, COALESCE(SUM(cost_usd),0) as retry_cost FROM spend_events WHERE org_id=$1 AND success=false AND created_at > NOW()-INTERVAL '${interval}'`, [orgId]),
      db(`SELECT COALESCE(SUM(cost_usd),0)/GREATEST(EXTRACT(DAY FROM NOW()-DATE_TRUNC('month',NOW())),1) as daily_burn FROM spend_events WHERE org_id=$1 AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`, [orgId]),
    ]);

    const dailyBurn  = parseFloat(projR.rows[0]?.daily_burn || 0);
    const daysLeft   = 30 - new Date().getDate();
    const mtdSpend   = parseFloat(totR.rows[0]?.total || 0);
    const projected  = mtdSpend + dailyBurn * daysLeft;

    ok(res, {
      spend: {
        total_30d:   mtdSpend.toFixed(2),
        total_calls: totR.rows[0]?.calls || '0',
        total_tokens:totR.rows[0]?.tokens || '0',
        avg_tokens_per_day: Math.round((parseInt(totR.rows[0]?.tokens)||0) / 30),
        mtd_change_pct: '—',
      },
      by_provider: provR.rows,
      by_feature:  featR.rows,
      by_model:    [],
      waste: {
        retry_count:      wasteR.rows[0]?.retry_count || '0',
        retry_cost:       parseFloat(wasteR.rows[0]?.retry_cost || 0).toFixed(2),
        total_waste_cost: parseFloat(wasteR.rows[0]?.retry_cost || 0).toFixed(2),
        waste_pct:        mtdSpend > 0 ? (parseFloat(wasteR.rows[0]?.retry_cost||0)/mtdSpend*100).toFixed(1) : '0',
        items: [],
      },
      projection: {
        mtd_spend:       mtdSpend.toFixed(2),
        daily_burn:      dailyBurn.toFixed(2),
        projected_total: projected.toFixed(2),
        days_elapsed:    new Date().getDate(),
        days_remaining:  daysLeft,
        days_in_month:   30,
        budget:          100,
        over_budget:     projected > 100,
        over_by:         Math.max(0, projected - 100).toFixed(2),
      },
      daily_spend:    [],
      providers:      [],
      active_alerts:  [],
      plan:           { name: 'free', calls_used: parseInt(totR.rows[0]?.calls||0), calls_limit: 10000 },
      providers_connected: 0,
    });
  } catch (e) {
    err(res, 'Dashboard error', 500);
  }
});

app.post('/api/v1/spend/keys', apiLimiter, requireAuth, async (req, res) => {
  const { provider, api_key, label } = req.body;
  if (!provider || !api_key) return err(res, 'provider and api_key required');
  if (api_key.length < 8) return err(res, 'api_key appears invalid');

  try {
    const id  = uuid();
    const enc = encrypt(api_key);
    await db(
      `INSERT INTO provider_keys (id, org_id, provider, encrypted_key, label) VALUES ($1,$2,$3,$4,$5)`,
      [id, req.org.id, provider, enc, label || provider]
    );
    ok(res, { id, provider, label: label || provider, connected: true }, 201);
  } catch (e) {
    err(res, 'Failed to connect key', 500);
  }
});

app.get('/api/v1/spend/keys', apiLimiter, requireAuth, async (req, res) => {
  try {
    const { rows } = await db(
      `SELECT id, provider, label, active, last_synced, created_at FROM provider_keys WHERE org_id=$1 ORDER BY created_at DESC`,
      [req.org.id]
    );
    ok(res, { keys: rows });
  } catch (e) {
    err(res, 'Failed to fetch keys', 500);
  }
});

app.delete('/api/v1/spend/keys/:keyId', apiLimiter, requireAuth, async (req, res) => {
  const { keyId } = req.params;
  if (!KEY_ID_RE.test(keyId)) return err(res, 'Invalid key ID');
  try {
    await db(`DELETE FROM provider_keys WHERE id=$1 AND org_id=$2`, [keyId, req.org.id]);
    ok(res, { deleted: true });
  } catch (e) {
    err(res, 'Failed to delete key', 500);
  }
});

app.post('/api/v1/spend/alerts', apiLimiter, requireAuth, async (req, res) => {
  const { spike_multiplier, budget_limit, slack_webhook } = req.body;
  if (slack_webhook && !slack_webhook.startsWith('https://')) return err(res, 'slack_webhook must be https://');
  try {
    await db(
      `INSERT INTO alert_rules (id, org_id, spike_multiplier, budget_limit, slack_webhook)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (org_id) DO UPDATE SET spike_multiplier=$3, budget_limit=$4, slack_webhook=$5, updated_at=NOW()`,
      [uuid(), req.org.id, Math.max(1, parseFloat(spike_multiplier)||2), Math.max(0, parseFloat(budget_limit)||100), slack_webhook||null]
    );
    ok(res, { success: true });
  } catch (e) {
    err(res, 'Failed to configure alerts', 500);
  }
});

// ── DEPLOY ROUTES ─────────────────────────────────────────────────
app.get('/api/v1/deploy/agents', apiLimiter, requireAnyAuth, async (req, res) => {
  try {
    const { rows } = await db(
      `SELECT a.id, a.name, a.model, a.version, a.status, a.guardrails, a.created_at,
              COUNT(r.id) FILTER (WHERE r.started_at > NOW()-INTERVAL '1d') as runs_today,
              ROUND(AVG(r.cost_usd)::numeric, 6) as avg_cost,
              ROUND(SUM(CASE WHEN r.status='success' THEN 1 ELSE 0 END)*100.0/GREATEST(COUNT(r.id),1)) as success_rate
       FROM agents a LEFT JOIN agent_runs r ON r.agent_id = a.id
       WHERE a.org_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.org.id]
    );
    ok(res, { agents: rows });
  } catch (e) {
    err(res, 'Failed to fetch agents', 500);
  }
});

app.post('/api/v1/deploy/agents', apiLimiter, requireAuth, async (req, res) => {
  const { name, model, system_prompt, github_url, guardrails } = req.body;
  if (!name) return err(res, 'name is required');

  try {
    const id = uuid();
    await db(
      `INSERT INTO agents (id, org_id, name, model, system_prompt, github_url, guardrails)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, req.org.id, name.trim(), model||'claude-3-5-sonnet-20241022',
       system_prompt||'', github_url||null,
       JSON.stringify(guardrails || { pii_detection:true, loop_breaker:true, cost_limit:0.50 })]
    );
    ok(res, { agent: { id, name, model, status:'idle' } }, 201);
  } catch (e) {
    if (e.code === '23505') return err(res, 'Agent name already exists');
    err(res, 'Failed to create agent', 500);
  }
});

app.post('/api/v1/deploy/agents/:agentId/run', apiLimiter, requireAnyAuth, async (req, res) => {
  const { agentId } = req.params;
  if (!KEY_ID_RE.test(agentId)) return err(res, 'Invalid agent ID');
  const { task, context, metadata } = req.body;
  if (!task) return err(res, 'task is required');

  try {
    const { rows } = await db(`SELECT id, name, model, guardrails FROM agents WHERE id=$1 AND org_id=$2`, [agentId, req.org.id]);
    if (!rows.length) return err(res, 'Agent not found', 404);

    const runId = uuid();
    await db(
      `INSERT INTO agent_runs (id, org_id, agent_id, task, status) VALUES ($1,$2,$3,$4,'running')`,
      [runId, req.org.id, agentId, task]
    );

    // Broadcast run start via WebSocket
    broadcastToOrg(req.org.id, { type: 'run_started', data: { run_id: runId, agent: rows[0].name, task } });

    ok(res, { run: { id: runId, agent_id: agentId, task, status: 'running' } }, 202);
  } catch (e) {
    err(res, 'Failed to start run', 500);
  }
});

app.get('/api/v1/deploy/agents/:agentId/runs', apiLimiter, requireAnyAuth, async (req, res) => {
  const { agentId } = req.params;
  if (!KEY_ID_RE.test(agentId)) return err(res, 'Invalid agent ID');
  const limit = Math.min(parseInt(req.query.limit)||20, 100);

  try {
    const { rows } = await db(
      `SELECT id, task, status, duration_ms, cost_usd, blocks, started_at, finished_at
       FROM agent_runs WHERE agent_id=$1 AND org_id=$2 ORDER BY started_at DESC LIMIT $3`,
      [agentId, req.org.id, limit]
    );
    ok(res, { runs: rows });
  } catch (e) {
    err(res, 'Failed to fetch runs', 500);
  }
});

app.delete('/api/v1/deploy/agents/:agentId', apiLimiter, requireAuth, async (req, res) => {
  const { agentId } = req.params;
  if (!KEY_ID_RE.test(agentId)) return err(res, 'Invalid agent ID');
  try {
    await db(`DELETE FROM agents WHERE id=$1 AND org_id=$2`, [agentId, req.org.id]);
    ok(res, { deleted: true });
  } catch (e) {
    err(res, 'Failed to delete agent', 500);
  }
});

// ── WEBSOCKET ─────────────────────────────────────────────────────
const orgClients = new Map(); // orgId → Set<WebSocket>

wss.on('connection', (ws, req) => {
  const url    = new URL(req.url, 'http://localhost');
  const token  = url.searchParams.get('token');
  let orgId    = null;

  try {
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      orgId = decoded.orgId;
    }
  } catch (_) {}

  if (!orgId) { ws.close(1008, 'Unauthorized'); return; }

  // Register client
  if (!orgClients.has(orgId)) orgClients.set(orgId, new Set());
  orgClients.get(orgId).add(ws);

  ws.send(JSON.stringify({ type: 'connected', org_id: orgId }));

  ws.on('close', () => {
    orgClients.get(orgId)?.delete(ws);
    if (orgClients.get(orgId)?.size === 0) orgClients.delete(orgId);
  });

  ws.on('error', () => ws.close());
});

function broadcastToOrg(orgId, msg) {
  const clients = orgClients.get(orgId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ── EXPORT CSV ────────────────────────────────────────────────────
app.get('/api/v1/export/csv', apiLimiter, requireAnyAuth, async (req, res) => {
  const range    = req.query.range || '30d';
  const interval = range === '7d' ? '7 days' : range === '90d' ? '90 days' : '30 days';
  try {
    const { rows } = await db(
      `SELECT model, provider, feature, SUM(input_tokens+output_tokens) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls,
              CASE WHEN COUNT(*) FILTER (WHERE NOT success) > 0 THEN 'has_errors' ELSE 'stable' END as status
       FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'
       GROUP BY model, provider, feature ORDER BY cost DESC`,
      [req.org.id]
    );
    ok(res, { rows: rows.map(r => ({ ...r, cost: parseFloat(r.cost).toFixed(6), tokens: parseInt(r.tokens) })) });
  } catch (e) {
    err(res, 'Export error', 500);
  }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => err(res, 'Not found', 404));

// ── START ─────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`ToolsAgent backend running on :${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws/traces`);
});

module.exports = { app, server };
