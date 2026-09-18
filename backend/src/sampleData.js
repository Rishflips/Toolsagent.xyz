'use strict';

const { v4: uuid } = require('uuid');

/**
 * Realistic sample data generator for ToolsAgent.
 * Generates sample traces, hallucinations, and spend events scoped strictly to an org_id
 * with is_sample = true.
 */

function generateSampleTraces(orgId) {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  // Rich decision steps templates
  const researchSteps = [
    { type: 'think', label: 'Initialize recursive citation crawl', ts: '0.12s', detail: 'Evaluating depth-first traversal strategy across benchmark papers.' },
    { type: 'tool', label: 'WebSearch.query', ts: '1.15s', detail: 'Fetched citation nodes for arXiv:2401.14257.', code: 'search(query="long-context attention retrieval benchmarks 2024")' },
    { type: 'tool', label: 'WebSearch.query', ts: '3.40s', detail: 'Repeated search call with identical parameter signature.', code: 'search(query="long-context attention retrieval benchmarks 2024")' },
    { type: 'flag', label: 'Loop breaker triggered', ts: '6.80s', detail: 'Detected redundant tool invocation with 100% parameter overlap.' },
    { type: 'warn', label: 'Execution halted by safety policy', ts: '9.20s', detail: 'Halted recursive loop to prevent budget overruns.' }
  ];

  const codeReviewSteps = [
    { type: 'think', label: 'Analyze git diff chunk', ts: '0.08s', detail: 'Scanning pull request diff for memory leaks and race conditions.' },
    { type: 'tool', label: 'GitDiff.parse', ts: '0.35s', detail: 'Parsed 14 files with 320 additions and 85 deletions.', code: 'git.diff(base="main", head="feat/retry-backoff")' },
    { type: 'think', label: 'Verify concurrency invariants', ts: '1.20s', detail: 'Evaluating exponential backoff jitter implementation.' },
    { type: 'result', label: 'Review completed', ts: '2.45s', detail: 'Approved with 1 minor suggestion regarding timeout defaults.' }
  ];

  const supportSteps = [
    { type: 'think', label: 'Parse inbound support ticket', ts: '0.05s', detail: 'Extracting account reference and transaction failure code.' },
    { type: 'tool', label: 'Stripe.lookupCharge', ts: '0.42s', detail: 'Retrieved charge details: ch_3P7x8y (failed: card_declined).', code: 'stripe.charges.retrieve("ch_3P7x8y")' },
    { type: 'think', label: 'Generate customer resolution message', ts: '0.95s', detail: 'Drafting explanation with retry payment link.' },
    { type: 'result', label: 'Reply drafted and queued', ts: '1.60s', detail: 'Notification dispatched to customer success queue.' }
  ];

  const triageSteps = [
    { type: 'think', label: 'Classify ticket intent', ts: '0.04s', detail: 'Determined category: Billing · Severity: P2' },
    { type: 'tool', label: 'CRM.assignQueue', ts: '0.22s', detail: 'Assigned to billing-tier-2 queue.', code: 'crm.tickets.route(id="T-9921", queue="billing-tier-2")' },
    { type: 'result', label: 'Routed in 380ms', ts: '0.38s', detail: 'Ticket metadata updated with priority SLA tag.' }
  ];

  const sqlSteps = [
    { type: 'think', label: 'Analyze SQL query structure', ts: '0.10s', detail: 'Checking execution plan for sequential scans on unindexed foreign keys.' },
    { type: 'tool', label: 'Postgres.explainAnalyze', ts: '0.45s', detail: 'Identified missing index on spend_events(org_id, created_at).', code: 'EXPLAIN ANALYZE SELECT * FROM spend_events WHERE org_id = $1' },
    { type: 'think', label: 'Synthesize migration DDL', ts: '0.75s', detail: 'Created concurrent index statement.' },
    { type: 'result', label: 'DDL generated', ts: '1.05s', detail: 'Index migration validated with 0 locking hazards.' }
  ];

  // Traces distribution:
  // - 8 traces in the last 1 hour (drives Agent Health and recent traces)
  // - 8 traces across 30-min intervals over the last 6 hours (drives Volume & Latency buckets)
  // - 4 traces in the 6h - 12h window (drives traces_prev_6h delta)
  const traces = [
    // Last hour (5m to 50m ago)
    {
      agent: 'support-agent',
      task: 'Handle tier-2 billing inquiry and payment failure diagnosis',
      model: 'gpt-4o',
      status: 'success',
      duration_ms: 1840,
      cost_usd: 0.003400,
      input_tokens: 1250,
      output_tokens: 380,
      flags: [],
      steps: supportSteps,
      started_at: new Date(now - 5 * minute).toISOString()
    },
    {
      agent: 'code-reviewer',
      task: 'Review pull request #142: asynchronous retry with exponential backoff',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 2450,
      cost_usd: 0.007800,
      input_tokens: 3100,
      output_tokens: 950,
      flags: [],
      steps: codeReviewSteps,
      started_at: new Date(now - 12 * minute).toISOString()
    },
    {
      agent: 'research-agent',
      task: 'Recursive citation traversal on transformer memory architectures',
      model: 'claude-3-5-sonnet-20241022',
      status: 'warning',
      duration_ms: 9200,
      cost_usd: 0.021000,
      input_tokens: 8400,
      output_tokens: 2400,
      flags: ['loop'],
      steps: researchSteps,
      started_at: new Date(now - 18 * minute).toISOString()
    },
    {
      agent: 'sql-copilot',
      task: 'Optimize slow join on tenant_events and partition by calendar month',
      model: 'gemini-1.5-pro',
      status: 'success',
      duration_ms: 1050,
      cost_usd: 0.002100,
      input_tokens: 920,
      output_tokens: 310,
      flags: [],
      steps: sqlSteps,
      started_at: new Date(now - 25 * minute).toISOString()
    },
    {
      agent: 'triage-bot',
      task: 'Classify inbound customer support ticket urgency and assign team',
      model: 'gpt-4o-mini',
      status: 'success',
      duration_ms: 380,
      cost_usd: 0.000320,
      input_tokens: 310,
      output_tokens: 45,
      flags: [],
      steps: triageSteps,
      started_at: new Date(now - 32 * minute).toISOString()
    },
    {
      agent: 'support-agent',
      task: 'Draft automated SLA compliance report for customer enterprise tier',
      model: 'gpt-4o',
      status: 'success',
      duration_ms: 2150,
      cost_usd: 0.004200,
      input_tokens: 1600,
      output_tokens: 520,
      flags: [],
      steps: supportSteps,
      started_at: new Date(now - 40 * minute).toISOString()
    },
    {
      agent: 'code-reviewer',
      task: 'Static security scan: sanitize user input before template rendering',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 1980,
      cost_usd: 0.005100,
      input_tokens: 2200,
      output_tokens: 680,
      flags: [],
      steps: codeReviewSteps,
      started_at: new Date(now - 48 * minute).toISOString()
    },
    {
      agent: 'triage-bot',
      task: 'Parse webhook payload for duplicate stripe dispute events',
      model: 'gpt-4o-mini',
      status: 'error',
      duration_ms: 590,
      cost_usd: 0.000550,
      input_tokens: 420,
      output_tokens: 80,
      flags: ['halluc'],
      steps: triageSteps,
      started_at: new Date(now - 55 * minute).toISOString()
    },

    // 1h to 6h ago (spaced across 30-min buckets)
    {
      agent: 'support-agent',
      task: 'Verify customer subscription cancellation policy and churn deflection',
      model: 'gpt-4o',
      status: 'success',
      duration_ms: 1720,
      cost_usd: 0.003100,
      input_tokens: 1100,
      output_tokens: 340,
      flags: [],
      steps: supportSteps,
      started_at: new Date(now - 1 * hour - 15 * minute).toISOString()
    },
    {
      agent: 'sql-copilot',
      task: 'Generate parameterized analytical query for cohort retention matrix',
      model: 'gemini-1.5-pro',
      status: 'success',
      duration_ms: 1180,
      cost_usd: 0.002400,
      input_tokens: 980,
      output_tokens: 360,
      flags: [],
      steps: sqlSteps,
      started_at: new Date(now - 1 * hour - 45 * minute).toISOString()
    },
    {
      agent: 'code-reviewer',
      task: 'Validate TypeScript interface definitions against OpenAPI 3.1 spec',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 1650,
      cost_usd: 0.004100,
      input_tokens: 1700,
      output_tokens: 520,
      flags: [],
      steps: codeReviewSteps,
      started_at: new Date(now - 2 * hour - 10 * minute).toISOString()
    },
    {
      agent: 'research-agent',
      task: 'Extract competitor pricing benchmarks from quarterly investor PDFs',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 4200,
      cost_usd: 0.011500,
      input_tokens: 4800,
      output_tokens: 1400,
      flags: [],
      steps: researchSteps,
      started_at: new Date(now - 2 * hour - 40 * minute).toISOString()
    },
    {
      agent: 'support-agent',
      task: 'Diagnose OAuth token refresh failure for Slack integration',
      model: 'gpt-4o',
      status: 'success',
      duration_ms: 1490,
      cost_usd: 0.002800,
      input_tokens: 950,
      output_tokens: 310,
      flags: [],
      steps: supportSteps,
      started_at: new Date(now - 3 * hour - 15 * minute).toISOString()
    },
    {
      agent: 'triage-bot',
      task: 'Extract order reference and tracking ID from unstructured email body',
      model: 'gpt-4o-mini',
      status: 'success',
      duration_ms: 360,
      cost_usd: 0.000280,
      input_tokens: 280,
      output_tokens: 40,
      flags: [],
      steps: triageSteps,
      started_at: new Date(now - 3 * hour - 45 * minute).toISOString()
    },
    {
      agent: 'code-reviewer',
      task: 'Analyze test coverage gap in authentication refresh handler',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 2200,
      cost_usd: 0.006200,
      input_tokens: 2600,
      output_tokens: 780,
      flags: [],
      steps: codeReviewSteps,
      started_at: new Date(now - 4 * hour - 20 * minute).toISOString()
    },
    {
      agent: 'sql-copilot',
      task: 'Index recommendation for slow dashboard metrics aggregation query',
      model: 'gemini-1.5-pro',
      status: 'success',
      duration_ms: 980,
      cost_usd: 0.001900,
      input_tokens: 840,
      output_tokens: 270,
      flags: [],
      steps: sqlSteps,
      started_at: new Date(now - 5 * hour - 0 * minute).toISOString()
    },

    // Prior 6h window (6h to 12h ago)
    {
      agent: 'support-agent',
      task: 'Resolve automated refund eligibility check for enterprise client',
      model: 'gpt-4o',
      status: 'success',
      duration_ms: 1650,
      cost_usd: 0.003100,
      input_tokens: 1100,
      output_tokens: 320,
      flags: [],
      steps: supportSteps,
      started_at: new Date(now - 7 * hour).toISOString()
    },
    {
      agent: 'code-reviewer',
      task: 'Automated linter analysis on schema migration scripts',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 1950,
      cost_usd: 0.005400,
      input_tokens: 2300,
      output_tokens: 690,
      flags: [],
      steps: codeReviewSteps,
      started_at: new Date(now - 8 * hour).toISOString()
    },
    {
      agent: 'research-agent',
      task: 'Summarize industry research on agentic coding frameworks',
      model: 'claude-3-5-sonnet-20241022',
      status: 'success',
      duration_ms: 3800,
      cost_usd: 0.009800,
      input_tokens: 4100,
      output_tokens: 1200,
      flags: [],
      steps: researchSteps,
      started_at: new Date(now - 9 * hour).toISOString()
    },
    {
      agent: 'sql-copilot',
      task: 'Audit constraint violations in legacy migration sequence',
      model: 'gemini-1.5-pro',
      status: 'success',
      duration_ms: 1120,
      cost_usd: 0.002200,
      input_tokens: 910,
      output_tokens: 320,
      flags: [],
      steps: sqlSteps,
      started_at: new Date(now - 10 * hour).toISOString()
    }
  ];

  return traces.map(t => ({
    id: uuid(),
    org_id: orgId,
    ...t,
    is_sample: true,
  }));
}

function generateSampleHallucinations(orgId, sampleTraces) {
  const now = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  // Find trace for support-agent or fallback to first
  const supportTrace = sampleTraces.find(t => t.agent === 'support-agent') || sampleTraces[0];
  const triageTrace = sampleTraces.find(t => t.agent === 'triage-bot') || sampleTraces[1];

  return [
    {
      id: uuid(),
      org_id: orgId,
      trace_id: supportTrace ? supportTrace.id : null,
      agent: 'support-agent',
      confidence: 0.88,
      excerpt: 'The system automatically issues full enterprise refunds within 5 minutes without manager sign-off.',
      reviewed: false,
      is_sample: true,
      created_at: new Date(now - 35 * minute).toISOString()
    },
    {
      id: uuid(),
      org_id: orgId,
      trace_id: triageTrace ? triageTrace.id : null,
      agent: 'triage-bot',
      confidence: 0.74,
      excerpt: 'All inbound dispute webhook notifications are permanently archived and require no manual review.',
      reviewed: false,
      is_sample: true,
      created_at: new Date(now - 2 * hour).toISOString()
    }
  ];
}

function generateSampleSpendEvents(orgId) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Generate 45 events over the past 14 days
  const events = [];

  const modelsConfig = [
    {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      features: ['code-gen', 'agent-orchestrator'],
      costRange: [0.008, 0.024],
      tokenRange: [3000, 8500],
      weight: 15,
      failRate: 0.05
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      features: ['summarizer', 'rag-search'],
      costRange: [0.005, 0.018],
      tokenRange: [2000, 6000],
      weight: 12,
      failRate: 0.20 // Some failed calls to produce realistic waste
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      features: ['chat-triage', 'classification'],
      costRange: [0.0003, 0.0012],
      tokenRange: [400, 1500],
      weight: 10,
      failRate: 0.0
    },
    {
      provider: 'google',
      model: 'gemini-1.5-pro',
      features: ['doc-parser', 'multimodal'],
      costRange: [0.002, 0.008],
      tokenRange: [1200, 4200],
      weight: 8,
      failRate: 0.15 // Some failed calls for waste finder
    },
    {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      features: ['router', 'entity-extraction'],
      costRange: [0.0004, 0.0015],
      tokenRange: [500, 1800],
      weight: 7,
      failRate: 0.0
    }
  ];

  let eventIndex = 0;
  // Distribute across days 0 to 13 (today back 13 days)
  for (let d = 13; d >= 0; d--) {
    const dayTimestamp = now - d * day;
    // 3 to 4 events per day
    const eventsThisDay = (d % 3 === 0) ? 4 : 3;

    for (let e = 0; e < eventsThisDay; e++) {
      const cfg = modelsConfig[eventIndex % modelsConfig.length];
      eventIndex++;

      const feature = cfg.features[e % cfg.features.length];
      const isFailed = cfg.failRate > 0 && ((e + d) % 4 === 0);

      const inTokens = Math.floor(cfg.tokenRange[0] + (cfg.tokenRange[1] - cfg.tokenRange[0]) * 0.7);
      const outTokens = Math.floor(inTokens * 0.35);
      const cost = parseFloat((cfg.costRange[0] + (cfg.costRange[1] - cfg.costRange[0]) * 0.6).toFixed(6));

      // Space events slightly within the day
      const eventTime = new Date(dayTimestamp + (e * 3 + 1) * 3600 * 1000).toISOString();

      events.push({
        id: uuid(),
        org_id: orgId,
        provider: cfg.provider,
        model: cfg.model,
        feature: feature,
        input_tokens: inTokens,
        output_tokens: outTokens,
        cost_usd: cost,
        success: !isFailed,
        metadata: { sample: true, generated_day: d },
        is_sample: true,
        created_at: eventTime
      });
    }
  }

  return events;
}

/**
 * Check if the given org has any REAL tenant data.
 */
async function hasRealData(db, orgId) {
  const [tracesR, spendR, keysR] = await Promise.all([
    db('SELECT 1 FROM traces WHERE org_id = $1 AND is_sample = false LIMIT 1', [orgId]),
    db('SELECT 1 FROM spend_events WHERE org_id = $1 AND is_sample = false LIMIT 1', [orgId]),
    db('SELECT 1 FROM provider_keys WHERE org_id = $1 LIMIT 1', [orgId])
  ]);
  return tracesR.rows.length > 0 || spendR.rows.length > 0 || keysR.rows.length > 0;
}

/**
 * Check if the given org currently has sample data present.
 */
async function hasSampleData(db, orgId) {
  const [tracesR, spendR] = await Promise.all([
    db('SELECT 1 FROM traces WHERE org_id = $1 AND is_sample = true LIMIT 1', [orgId]),
    db('SELECT 1 FROM spend_events WHERE org_id = $1 AND is_sample = true LIMIT 1', [orgId])
  ]);
  return tracesR.rows.length > 0 || spendR.rows.length > 0;
}

/**
 * Check if the org has explicitly cleared sample data.
 */
async function isSampleCleared(db, orgId) {
  const { rows } = await db('SELECT sample_cleared FROM orgs WHERE id = $1', [orgId]);
  return rows.length > 0 && Boolean(rows[0].sample_cleared);
}

/**
 * Seed realistic sample data for an org.
 * Strictly guarantees that if real data exists, no sample data is seeded.
 */
async function seedSampleData(db, orgId) {
  const realExists = await hasRealData(db, orgId);
  if (realExists) {
    console.log(`[sampleData] Refusing to seed sample data for org ${orgId}: real tenant data exists.`);
    return false;
  }

  const sampleTraces = generateSampleTraces(orgId);
  const sampleHals = generateSampleHallucinations(orgId, sampleTraces);
  const sampleSpend = generateSampleSpendEvents(orgId);

  await db('BEGIN');
  try {
    // Delete any leftover sample rows first
    await db('DELETE FROM hallucinations WHERE org_id = $1 AND is_sample = true', [orgId]);
    await db('DELETE FROM traces WHERE org_id = $1 AND is_sample = true', [orgId]);
    await db('DELETE FROM spend_events WHERE org_id = $1 AND is_sample = true', [orgId]);

    // Insert sample traces
    for (const t of sampleTraces) {
      await db(
        `INSERT INTO traces (id, org_id, agent, task, model, status, duration_ms, cost_usd, input_tokens, output_tokens, flags, steps, metadata, started_at, is_sample)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [t.id, t.org_id, t.agent, t.task, t.model, t.status, t.duration_ms, t.cost_usd, t.input_tokens, t.output_tokens, t.flags, JSON.stringify(t.steps), JSON.stringify({ sample: true }), t.started_at, true]
      );
    }

    // Insert sample hallucinations
    for (const h of sampleHals) {
      await db(
        `INSERT INTO hallucinations (id, org_id, trace_id, agent, confidence, excerpt, reviewed, created_at, is_sample)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [h.id, h.org_id, h.trace_id, h.agent, h.confidence, h.excerpt, h.reviewed, h.created_at, true]
      );
    }

    // Insert sample spend events
    for (const s of sampleSpend) {
      await db(
        `INSERT INTO spend_events (id, org_id, provider, model, feature, input_tokens, output_tokens, cost_usd, success, metadata, created_at, is_sample)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [s.id, s.org_id, s.provider, s.model, s.feature, s.input_tokens, s.output_tokens, s.cost_usd, s.success, JSON.stringify(s.metadata), s.created_at, true]
      );
    }

    // Update org sample_cleared flag to false
    await db('UPDATE orgs SET sample_cleared = false WHERE id = $1', [orgId]);

    await db('COMMIT');
    console.log(`[sampleData] Seeded sample data for org ${orgId}: ${sampleTraces.length} traces, ${sampleSpend.length} spend events.`);
    return true;
  } catch (err) {
    await db('ROLLBACK');
    console.error(`[sampleData] Error seeding sample data: ${err.message}`);
    throw err;
  }
}

/**
 * Idempotently clear all sample data for an org. Safe to run multiple times.
 */
async function clearSampleData(db, orgId) {
  await db('BEGIN');
  try {
    await db('DELETE FROM hallucinations WHERE org_id = $1 AND is_sample = true', [orgId]);
    await db('DELETE FROM traces WHERE org_id = $1 AND is_sample = true', [orgId]);
    await db('DELETE FROM spend_events WHERE org_id = $1 AND is_sample = true', [orgId]);
    await db('UPDATE orgs SET sample_cleared = true WHERE id = $1', [orgId]);
    await db('COMMIT');
    console.log(`[sampleData] Cleared all sample data for org ${orgId}.`);
    return { cleared: true };
  } catch (err) {
    await db('ROLLBACK');
    console.error(`[sampleData] Error clearing sample data: ${err.message}`);
    throw err;
  }
}

module.exports = {
  hasRealData,
  hasSampleData,
  isSampleCleared,
  seedSampleData,
  clearSampleData
};
