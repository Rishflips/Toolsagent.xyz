'use strict';

const fs           = require('fs');
const path         = require('path');
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

function validateSecret(name, value, { minLength = 32 } = {}) {
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

function deriveSecret(masterSecret, purpose) {
  return crypto.createHmac('sha256', masterSecret).update(purpose).digest('hex');
}

function getSecretStorageInfo() {
  if (process.env.SECRET_FILE) {
    return {
      secretPath: process.env.SECRET_FILE,
      markerPath: path.join(path.dirname(process.env.SECRET_FILE), '.secret_source'),
      isFallback: false,
    };
  }

  let dataDir = process.env.DATA_DIR;
  let isFallback = false;
  if (!dataDir) {
    if (fs.existsSync('/data')) {
      dataDir = '/data';
    } else {
      try {
        fs.mkdirSync('/data', { recursive: true });
        dataDir = '/data';
      } catch (_) {
        dataDir = path.resolve(__dirname, '../data');
        isFallback = true;
      }
    }
  }

  const secretPath = path.join(dataDir, 'secret');
  const markerPath = path.join(dataDir, '.secret_source');
  return { secretPath, markerPath, isFallback };
}

function recordAndCheckSecretSource(markerPath, currentSource) {
  try {
    if (fs.existsSync(markerPath)) {
      const prevSource = fs.readFileSync(markerPath, 'utf8').trim();
      if (prevSource && prevSource !== currentSource) {
        console.warn(
          `[security] WARNING: Secret source changed from "${prevSource}" to "${currentSource}". ` +
          `Existing sessions may be invalidated and previously encrypted data may no longer be decryptable.`
        );
      }
    }
    const targetDir = path.dirname(markerPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(markerPath, currentSource + '\n', { mode: 0o600, encoding: 'utf8' });
    try {
      fs.chmodSync(markerPath, 0o600);
    } catch (_) {}
  } catch (err) {
    console.error(`[security] Error checking/updating secret source marker: ${err.message}`);
  }
}

function getOrGenerateMasterSecret(secretPath, isFallback) {
  if (isFallback) {
    console.warn(
      `[security] WARNING: Using repository fallback path for secret storage at ${secretPath}. ` +
      `This secret file must never be committed!`
    );
  }

  if (fs.existsSync(secretPath)) {
    try {
      const persisted = fs.readFileSync(secretPath, 'utf8').trim();
      if (persisted && persisted.length >= 32 && !INSECURE_SECRETS.has(persisted)) {
        console.log(`[security] Loaded persisted secret from ${secretPath}`);
        return persisted;
      }
    } catch (err) {
      console.error(`[security] Error reading persisted secret at ${secretPath}: ${err.message}`);
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  const targetDir = path.dirname(secretPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  }

  fs.writeFileSync(secretPath, generated + '\n', { mode: 0o600, encoding: 'utf8' });
  try {
    fs.chmodSync(secretPath, 0o600);
  } catch (_) {}

  console.log(`[security] Generated secret and persisted to ${secretPath}`);
  return generated;
}

function resolveSecrets() {
  const envJwt = process.env.JWT_SECRET;
  const envEnc = process.env.ENCRYPTION_SECRET;
  const storage = getSecretStorageInfo();

  const jwtSource = envJwt ? 'env' : 'file';
  const encSource = envEnc ? 'env' : 'file';
  const currentSource = `JWT: ${jwtSource}, ENCRYPTION: ${encSource}`;

  recordAndCheckSecretSource(storage.markerPath, currentSource);

  if (envJwt && envEnc) {
    console.log('[security] Using JWT_SECRET and ENCRYPTION_SECRET from environment');
    return {
      jwtSecret: validateSecret('JWT_SECRET', envJwt),
      encSecret: validateSecret('ENCRYPTION_SECRET', envEnc),
    };
  }

  const masterSecret = getOrGenerateMasterSecret(storage.secretPath, storage.isFallback);

  const jwtSecret = envJwt
    ? validateSecret('JWT_SECRET', envJwt)
    : deriveSecret(masterSecret, 'jwt_secret');

  const encSecret = envEnc
    ? validateSecret('ENCRYPTION_SECRET', envEnc)
    : deriveSecret(masterSecret, 'encryption_secret');

  return { jwtSecret, encSecret };
}

const { jwtSecret: JWT_SECRET, encSecret: ENC_SECRET } = resolveSecrets();


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

// Compact token counts for display: 18.4M, 1.2B, 940, 12.5K
function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// Cost for display. Never round a real cost down to 0.00 — a sub-cent model
// shown as "$0.00" reads as free, which is the fake-number problem this
// dashboard exists to remove.
function formatCost(n) {
  if (!Number.isFinite(n) || n === 0) return '0.00';
  if (n < 0.01) return n.toFixed(4);
  return n.toFixed(2);
}

// Human duration from milliseconds. Traces range from ~800ms to ~4 minutes,
// and a single fixed unit reads wrong at both ends.
function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n < 1000)    return `${Math.round(n)}ms`;
  if (n < 60000)   return `${(n / 1000).toFixed(1)}s`;
  const m = Math.floor(n / 60000);
  return `${m}m ${Math.round((n % 60000) / 1000)}s`;
}

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
    // steps + cost + duration come back formatted so the UI never has to guess
    // the display rule. Day 8 moves steps behind a single-trace detail endpoint;
    // at 50 rows of small JSON it is cheap enough to inline today.
    let q = `SELECT id, agent, task, model, status, duration_ms, cost_usd, flags, steps, started_at
             FROM traces WHERE org_id = $1`;
    const params = [req.org.id];
    if (agent)  { params.push(agent);  q += ` AND agent = $${params.length}`; }
    if (status) { params.push(status); q += ` AND status = $${params.length}`; }
    q += ` ORDER BY started_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(Math.min(parseInt(limit)||50, 200), Math.max(parseInt(offset)||0, 0));
    const { rows } = await db(q, params);
    ok(res, { traces: rows.map(t => ({
      ...t,
      cost:     formatCost(parseFloat(t.cost_usd)),
      duration: formatDuration(t.duration_ms),
      steps:    Array.isArray(t.steps) ? t.steps : [],
    })) });
  } catch (e) {
    err(res, 'Failed to fetch traces', 500);
  }
});

app.get('/api/v1/observe/dashboard', apiLimiter, requireAnyAuth, async (req, res) => {
  try {
    const orgId = req.org.id;
    const [totalR, flagsR, costR, agentsR, prevR, bucketR, hallR] = await Promise.all([
      db(`SELECT COUNT(*) as total, AVG(duration_ms) as avg_lat FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h'`, [orgId]),
      db(`SELECT COUNT(*) as flags FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h' AND status != 'success'`, [orgId]),
      db(`SELECT COALESCE(SUM(cost_usd),0) as total FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '6h'`, [orgId]),
      db(`SELECT agent, COUNT(*) as runs, AVG(cost_usd) as avg_cost, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END)*100.0/COUNT(*) as health FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '1h' GROUP BY agent`, [orgId]),
      // Previous 6h window, so the KPI deltas are measured rather than invented.
      db(`SELECT COUNT(*) as total FROM traces WHERE org_id=$1 AND started_at > NOW()-INTERVAL '12h' AND started_at <= NOW()-INTERVAL '6h'`, [orgId]),
      // Real 30-minute buckets over the last 6h. generate_series LEFT JOINed to
      // traces so a quiet half hour shows as 0 instead of the axis shifting.
      // The series ENDS at the bucket containing NOW(), not at the top of the
      // hour: ending on the hour drops the current half hour, so a trace logged
      // two minutes ago would not appear on its own chart until the next
      // half-hour tick. That exact off-by-one-bucket was caught in verification.
      db(`WITH b AS (
            SELECT generate_series(
                     DATE_TRUNC('hour', NOW())
                       + (INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM NOW()) / 30))
                       - INTERVAL '5 hours 30 minutes',
                     DATE_TRUNC('hour', NOW())
                       + (INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM NOW()) / 30)),
                     INTERVAL '30 minutes') AS bucket
          )
          SELECT TO_CHAR(b.bucket, 'HH24:MI') AS t,
                 COUNT(t.id)::int AS traces,
                 COUNT(t.id) FILTER (WHERE t.status <> 'success')::int AS flags,
                 COALESCE(ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY t.duration_ms)), 0)::int AS p50_ms,
                 COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t.duration_ms)), 0)::int AS p95_ms
          FROM b
          LEFT JOIN traces t ON t.org_id = $1
               AND t.started_at >= b.bucket
               AND t.started_at <  b.bucket + INTERVAL '30 minutes'
          GROUP BY b.bucket ORDER BY b.bucket`, [orgId]),
      // Hallucination radar reads the real table. The write path lands on Day 10,
      // so today this is honestly empty rather than three invented rows.
      db(`SELECT h.id, h.agent, h.confidence, h.excerpt, h.reviewed, h.created_at
          FROM hallucinations h
          WHERE h.org_id=$1 AND h.created_at > NOW()-INTERVAL '6h'
          ORDER BY h.confidence DESC LIMIT 3`, [orgId]),
    ]);

    const total6h  = parseInt(totalR.rows[0]?.total || 0);
    const prev6h   = parseInt(prevR.rows[0]?.total || 0);
    const hall6h   = hallR.rows.length;

    ok(res, {
      traces_6h:    total6h,
      traces_prev_6h: prev6h,
      avg_latency:  formatDuration(totalR.rows[0]?.avg_lat || 0),
      success_rate: total6h > 0
        ? `${(100 - parseFloat(flagsR.rows[0]?.flags || 0) / total6h * 100).toFixed(1)}%`
        : '100%',
      // The radar's own number. Was the literal string '0.00%' regardless of
      // reality; now it is the share of the last 6h of traces that carry a
      // flagged hallucination row.
      halluc_rate:  total6h > 0 ? `${(hall6h / total6h * 100).toFixed(2)}%` : '0.00%',
      halluc_count: hall6h,
      hallucinations: hallR.rows.map(h => ({
        id:       h.id,
        agent:    h.agent,
        score:    parseFloat(h.confidence),
        pct:      Math.round(parseFloat(h.confidence) * 100),
        excerpt:  h.excerpt,
        reviewed: h.reviewed,
      })),
      cost_6h:      `$${formatCost(parseFloat(costR.rows[0]?.total || 0))}`,
      agents:       agentsR.rows.map(a => ({
        agent:    a.agent,
        runs:     parseInt(a.runs),
        avg_cost: formatCost(parseFloat(a.avg_cost || 0)),
        health:   Math.round(parseFloat(a.health || 0)),
      })),
      volume:  bucketR.rows.map(r => ({ t: r.t, traces: r.traces, flags: r.flags })),
      latency: bucketR.rows.map(r => ({ t: r.t, p50: r.p50_ms / 1000, p95: r.p95_ms / 1000 })),
    });
  } catch (e) {
    console.error('Observe dashboard error:', e.message);
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
    const [totR, provR, featR, wasteR, projR, dailyR, modelR, outputCostR] = await Promise.all([
      db(`SELECT COALESCE(SUM(cost_usd),0) as total, COUNT(*) as calls, COALESCE(SUM(input_tokens+output_tokens),0) as tokens FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'`, [orgId]),
      db(`SELECT provider, COALESCE(SUM(cost_usd),0) as cost, COUNT(*) as calls, COUNT(*) FILTER (WHERE NOT success) as failed, COALESCE(SUM(input_tokens+output_tokens),0) as tokens FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}' GROUP BY provider ORDER BY cost DESC`, [orgId]),
      db(`SELECT feature, COALESCE(SUM(cost_usd),0) as cost, COUNT(*) as calls FROM spend_events WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}' GROUP BY feature ORDER BY cost DESC`, [orgId]),
      db(`SELECT COUNT(*) as retry_count, COALESCE(SUM(cost_usd),0) as retry_cost FROM spend_events WHERE org_id=$1 AND success=false AND created_at > NOW()-INTERVAL '${interval}'`, [orgId]),
      db(`SELECT COALESCE(SUM(cost_usd),0)/GREATEST(EXTRACT(DAY FROM NOW()-DATE_TRUNC('month',NOW())),1) as daily_burn FROM spend_events WHERE org_id=$1 AND DATE_TRUNC('month',created_at)=DATE_TRUNC('month',NOW())`, [orgId]),
      // Daily series for the stacked-provider chart.
      db(`SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
                 provider,
                 COALESCE(SUM(cost_usd),0) AS cost
          FROM spend_events
          WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'
          GROUP BY day, provider
          ORDER BY day ASC`, [orgId]),
      // Per-model rollup for the models table.
      db(`SELECT model,
                 provider,
                 COALESCE(SUM(input_tokens+output_tokens),0) AS tokens,
                 COALESCE(SUM(cost_usd),0) AS cost,
                 COUNT(*) AS calls,
                 COUNT(*) FILTER (WHERE NOT success) AS failed_calls,
                 ARRAY_AGG(DISTINCT feature) AS features
          FROM spend_events
          WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'
          GROUP BY model, provider
          ORDER BY cost DESC
          LIMIT 50`, [orgId]),
      // Average cost per SUCCESSFUL call, per feature, per day.
      db(`SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
                 feature,
                 COALESCE(SUM(cost_usd),0)
                   / GREATEST(COUNT(*) FILTER (WHERE success), 1) AS avg_cost
          FROM spend_events
          WHERE org_id=$1 AND created_at > NOW()-INTERVAL '${interval}'
          GROUP BY day, feature
          ORDER BY day ASC`, [orgId]),
    ]);

    const dailyBurn  = parseFloat(projR.rows[0]?.daily_burn || 0);
    const daysLeft   = 30 - new Date().getDate();
    const mtdSpend   = parseFloat(totR.rows[0]?.total || 0);
    const projected  = mtdSpend + dailyBurn * daysLeft;

    // Pivot [{day, provider, cost}] into [{d, openai, anthropic, ...}]
    const byDay = new Map();
    for (const r of dailyR.rows) {
      if (!byDay.has(r.day)) byDay.set(r.day, { d: r.day });
      byDay.get(r.day)[r.provider] = parseFloat(r.cost).toFixed(4);
    }
    const daily_spend = [...byDay.values()];

    // Per-model rollup.
    const by_model = modelR.rows.map(r => ({
      model:        r.model,
      provider:     r.provider,
      features:     r.features || [],
      tokens:       Number(r.tokens),
      tokens_h:     formatTokens(Number(r.tokens)),
      cost:         formatCost(parseFloat(r.cost)),
      calls:        Number(r.calls),
      spike:        false,   // filled in below
      waste:        Number(r.failed_calls) > 0,
      new:          false,
    }));

    // A model is spiking if its cost is more than 2x the mean model cost.
    if (by_model.length > 1) {
      const mean = by_model.reduce((s, m) => s + parseFloat(m.cost), 0) / by_model.length;
      for (const m of by_model) m.spike = mean > 0 && parseFloat(m.cost) > mean * 2;
    }

    // Waste items come from real failed-call rows, not a static list.
    const wasteItems = modelR.rows
      .filter(r => Number(r.failed_calls) > 0)
      .map(r => ({
        src:   `${r.features?.[0] || 'unknown'} · ${r.model}`,
        cost:  formatCost(parseFloat(r.cost)),
        count: Number(r.failed_calls),
        pct:   Math.round(Number(r.failed_calls) / Number(r.calls) * 100),
        desc:  `${r.failed_calls} of ${r.calls} calls to ${r.model} failed. `
             + `Check for context-length or rate-limit errors before the call is made.`,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 10);

    // Pivot [{day, feature, avg_cost}] -> [{d, 'email-drafter': 0.011, ...}]
    // Only the top 5 features by spend get their own line; the rest are folded
    // into "other" so the legend stays readable.
    const featureTotals = new Map();
    for (const r of outputCostR.rows) {
      featureTotals.set(r.feature,
        (featureTotals.get(r.feature) || 0) + parseFloat(r.avg_cost));
    }
    const topFeatures = new Set(
      [...featureTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
    );

    const byDayCost = new Map();
    for (const r of outputCostR.rows) {
      if (!byDayCost.has(r.day)) byDayCost.set(r.day, { d: r.day });
      const key = topFeatures.has(r.feature) ? r.feature : 'other';
      byDayCost.get(r.day)[key] = parseFloat(parseFloat(r.avg_cost).toFixed(6));
    }
    const output_cost = [...byDayCost.values()];

    // Providers come from observed traffic; "connected" means a key row exists.
    const providers = provR.rows.map(r => ({
      provider: r.provider,
      cost:     formatCost(parseFloat(r.cost)),
      calls:    Number(r.calls),
      tokens:   Number(r.tokens),
      connected: false,
      efficiency: Number(r.calls) > 0
        ? Math.round((1 - Number(r.failed || 0) / Number(r.calls)) * 100)
        : 100,
    }));

    const keyR = await db(
      `SELECT DISTINCT provider FROM provider_keys WHERE org_id=$1 AND active=true`,
      [orgId]
    );
    const connectedSet = new Set(keyR.rows.map(r => r.provider));
    for (const p of providers) p.connected = connectedSet.has(p.provider);

    // Active alerts are derived from the live projection and spike flags.
    const alertR = await db(
      `SELECT spike_multiplier, budget_limit, slack_webhook FROM alert_rules
       WHERE org_id=$1 LIMIT 1`, [orgId]
    );
    const active_alerts = [];
    const rule = alertR.rows[0];
    if (rule) {
      if (projected > parseFloat(rule.budget_limit)) {
        active_alerts.push({
          level: 'error',
          msg: `Projected $${projected.toFixed(2)} exceeds budget $${rule.budget_limit}`,
        });
      }
      for (const m of by_model.filter(x => x.spike).slice(0, 3)) {
        active_alerts.push({ level: 'warn', msg: `Spike: ${m.model} cost above 2x average` });
      }
    }

    ok(res, {
      spend: {
        // formatCost preserves sub-cent precision: an account whose whole
        // spend is $0.003 must not read as "$0.00" (i.e. free).
        total_30d:   formatCost(mtdSpend),
        total_calls: totR.rows[0]?.calls || '0',
        total_tokens:totR.rows[0]?.tokens || '0',
        avg_tokens_per_day: Math.round((parseInt(totR.rows[0]?.tokens)||0) / 30),
        mtd_change_pct: '—',
      },
      by_provider: provR.rows,
      by_feature:  featR.rows,
      by_model,
      waste: {
        retry_count:      wasteR.rows[0]?.retry_count || '0',
        retry_cost:       parseFloat(wasteR.rows[0]?.retry_cost || 0).toFixed(2),
        total_waste_cost: parseFloat(wasteR.rows[0]?.retry_cost || 0).toFixed(2),
        waste_pct:        mtdSpend > 0 ? (parseFloat(wasteR.rows[0]?.retry_cost||0)/mtdSpend*100).toFixed(1) : '0',
        items: wasteItems,
      },
      projection: {
        mtd_spend:       formatCost(mtdSpend),
        daily_burn:      formatCost(dailyBurn),
        projected_total: formatCost(projected),
        days_elapsed:    new Date().getDate(),
        days_remaining:  daysLeft,
        days_in_month:   30,
        budget:          100,
        over_budget:     projected > 100,
        over_by:         formatCost(Math.max(0, projected - 100)),
      },
      daily_spend,
      output_cost,
      providers,
      active_alerts,
      plan:           { name: 'free', calls_used: parseInt(totR.rows[0]?.calls||0), calls_limit: 10000 },
      providers_connected: connectedSet.size,
    });
  } catch (e) {
    console.error('Spend dashboard error:', e.message);
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
  const spike  = Math.max(1, parseFloat(spike_multiplier) || 2);
  const budget = Math.max(0, parseFloat(budget_limit) || 100);
  const hook   = slack_webhook || null;

  try {
    // UPDATE-then-INSERT rather than ON CONFLICT: a DB created from an earlier
    // schema has no unique constraint on alert_rules(org_id), and ON CONFLICT
    // against a missing constraint fails with 42P10 — which made this endpoint
    // return 500 for every caller. One rule row per org is the invariant either
    // way, and this cannot break on an older database.
    const upd = await db(
      `UPDATE alert_rules SET spike_multiplier=$2, budget_limit=$3, slack_webhook=$4, updated_at=NOW()
       WHERE org_id=$1`,
      [req.org.id, spike, budget, hook]
    );

    if (upd.rowCount === 0) {
      await db(
        `INSERT INTO alert_rules (id, org_id, spike_multiplier, budget_limit, slack_webhook)
         VALUES ($1,$2,$3,$4,$5)`,
        [uuid(), req.org.id, spike, budget, hook]
      );
    }

    // Read back what is actually stored — never report success on a write we
    // did not confirm.
    const { rows } = await db(
      `SELECT spike_multiplier, budget_limit, slack_webhook FROM alert_rules WHERE org_id=$1`,
      [req.org.id]
    );
    if (!rows.length) return err(res, 'Alert rule not saved', 500);

    ok(res, {
      success: true,
      rule: {
        spike_multiplier: parseFloat(rows[0].spike_multiplier),
        budget_limit:     parseFloat(rows[0].budget_limit),
        slack_webhook:    rows[0].slack_webhook,
      },
    });
  } catch (e) {
    console.error('Alert config error:', e.message);
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
