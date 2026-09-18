'use strict';

const { Pool } = require('pg');

const BASE = 'http://localhost:4000';
const pool = new Pool({ connectionString: 'postgresql://toolsagent:toolsagent_dev@localhost:55432/toolsagent' });

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log('================================================================');
  console.log('       TA-03 VERIFICATION TEST SUITE — SEEDED SAMPLE DATA       ');
  console.log('================================================================\n');

  const ts = Date.now();

  // ─────────────────────────────────────────────────────────────
  // 1. FRESH SIGNUP WITH NO REAL DATA: SHOWS POPULATED PANELS & SAMPLE BADGE
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Fresh signup shows populated Observe & Spend panels with sample badge ---');
  const user1 = {
    name: 'Alice Sample',
    email: `alice-sample-${ts}@toolsagent.test`,
    password: 'password123',
    confirm_new_org: true
  };

  const signup1 = await req('/api/auth/signup', { method: 'POST', body: JSON.stringify(user1) });
  if (signup1.status !== 201) {
    console.error('FAIL: Signup 1 failed:', signup1);
    process.exit(1);
  }
  const token1 = signup1.data.token;
  const orgId1 = signup1.data.user.id; // User id, let's get org_id from /me
  const me1 = await req('/api/auth/me', { token: token1 });
  const realOrgId1 = me1.data.user.org_id;

  console.log(`✓ Signed up fresh user ${user1.email} (Org ID: ${realOrgId1})`);

  // Check Observe Traces list
  const traces1 = await req('/api/v1/observe/traces', { token: token1 });
  console.log(`✓ Observe traces endpoint: status=${traces1.status}, is_sample=${traces1.data.is_sample}, count=${traces1.data.traces?.length}`);
  if (!traces1.data.is_sample || traces1.data.traces.length === 0) {
    console.error('FAIL: Expected traces to be populated sample data!');
    process.exit(1);
  }

  // Check loop flag & decision steps in sample traces
  const loopTrace = traces1.data.traces.find(t => t.flags?.includes('loop'));
  console.log(`✓ Sample traces contain flagged loop trace: "${loopTrace?.task}" (agent: ${loopTrace?.agent}, flags: ${JSON.stringify(loopTrace?.flags)})`);
  console.log(`✓ Sample trace decision chain steps count: ${loopTrace?.steps?.length}`);
  if (!loopTrace || loopTrace.steps.length === 0) {
    console.error('FAIL: Loop trace or steps missing from sample data!');
    process.exit(1);
  }

  // Check Observe Dashboard
  const obsDash1 = await req('/api/v1/observe/dashboard', { token: token1 });
  console.log(`✓ Observe dashboard: is_sample=${obsDash1.data.is_sample}`);
  console.log(`  - Traces / 6h: ${obsDash1.data.traces_6h}`);
  console.log(`  - Success Rate: ${obsDash1.data.success_rate}`);
  console.log(`  - Flag Rate: ${obsDash1.data.flag_rate || obsDash1.data.halluc_rate}`);
  console.log(`  - Avg Latency: ${obsDash1.data.avg_latency}`);
  console.log(`  - Cost / 6h: ${obsDash1.data.cost_6h}`);
  console.log(`  - Active Agents: ${obsDash1.data.agents?.map(a => a.agent).join(', ')}`);
  console.log(`  - Volume Buckets: ${obsDash1.data.volume?.length} intervals`);
  console.log(`  - Latency Trends: ${obsDash1.data.latency?.length} intervals`);
  console.log(`  - Hallucination Radar: ${obsDash1.data.hallucinations?.length} flagged outputs`);

  if (!obsDash1.data.is_sample || obsDash1.data.traces_6h === 0 || obsDash1.data.agents.length === 0 || obsDash1.data.volume.length === 0) {
    console.error('FAIL: Observe dashboard panels are empty!');
    process.exit(1);
  }

  // Check Spend Dashboard
  const spendDash1 = await req('/api/v1/spend/dashboard', { token: token1 });
  console.log(`✓ Spend dashboard: is_sample=${spendDash1.data.is_sample}`);
  console.log(`  - MTD Spend: $${spendDash1.data.spend?.total_30d}`);
  console.log(`  - Projected / mo: $${spendDash1.data.projection?.projected_total}`);
  console.log(`  - Cost / 1K tok: ${spendDash1.data.spend?.total_tokens} total tokens`);
  console.log(`  - Waste Finder: $${spendDash1.data.waste?.total_waste_cost} across ${spendDash1.data.waste?.items?.length} items`);
  console.log(`  - Models count: ${spendDash1.data.by_model?.length} models`);
  console.log(`  - Daily Spend Series: ${spendDash1.data.daily_spend?.length} days`);
  console.log(`  - Output Cost Features: ${spendDash1.data.output_cost?.length} days`);
  console.log(`  - Providers: ${spendDash1.data.providers?.map(p => `${p.provider} (${p.efficiency}% eff)`).join(', ')}`);

  if (!spendDash1.data.is_sample || parseFloat(spendDash1.data.spend?.total_30d) === 0 || spendDash1.data.by_model.length === 0 || spendDash1.data.providers.length === 0) {
    console.error('FAIL: Spend dashboard panels are empty!');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. CHECK THAT SAMPLE ROWS DO NOT APPEAR IN REAL AGGREGATIONS
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Sample rows never appear in real aggregations (CSV export & real queries) ---');
  const csv1 = await req('/api/v1/export/csv', { token: token1 });
  console.log(`✓ GET /api/v1/export/csv status=${csv1.status}, rows returned=${csv1.data.rows?.length}`);
  if (csv1.data.rows?.length !== 0) {
    console.error('FAIL: Sample rows leaked into CSV export!', csv1.data.rows);
    process.exit(1);
  }
  console.log('✓ Verified: CSV export returns 0 rows when only sample data exists.');

  // Check DB directly for real rows
  const realRowsCheck = await pool.query(
    'SELECT (SELECT COUNT(*) FROM traces WHERE org_id = $1 AND is_sample = false) as real_traces, (SELECT COUNT(*) FROM spend_events WHERE org_id = $1 AND is_sample = false) as real_spend',
    [realOrgId1]
  );
  console.log(`✓ Direct DB check: real_traces=${realRowsCheck.rows[0].real_traces}, real_spend=${realRowsCheck.rows[0].real_spend}`);
  if (realRowsCheck.rows[0].real_traces > 0 || realRowsCheck.rows[0].real_spend > 0) {
    console.error('FAIL: Real rows count should be 0!');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. ONE CLICK CLEARS ALL SAMPLE DATA (IDEMPOTENT & SAFE TO RUN TWICE)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: One-click clear sample data & idempotency (safe to run twice) ---');
  const clear1 = await req('/api/v1/sample-data/clear', { method: 'POST', token: token1 });
  console.log(`✓ Clear action run 1: status=${clear1.status}, data=${JSON.stringify(clear1.data)}`);
  if (clear1.status !== 200 || !clear1.data.cleared) {
    console.error('FAIL: Clear 1 failed!');
    process.exit(1);
  }

  // Second run to confirm idempotency
  const clear2 = await req('/api/v1/sample-data/clear', { method: 'POST', token: token1 });
  console.log(`✓ Clear action run 2 (idempotency check): status=${clear2.status}, data=${JSON.stringify(clear2.data)}`);
  if (clear2.status !== 200 || !clear2.data.cleared) {
    console.error('FAIL: Clear 2 (idempotency) failed!');
    process.exit(1);
  }

  // Verify DB: 0 sample rows remain
  const dbAfterClear = await pool.query(
    'SELECT (SELECT COUNT(*) FROM traces WHERE org_id = $1) as total_traces, (SELECT COUNT(*) FROM spend_events WHERE org_id = $1) as total_spend, (SELECT sample_cleared FROM orgs WHERE id = $1) as sample_cleared',
    [realOrgId1]
  );
  console.log(`✓ DB counts after clear: traces=${dbAfterClear.rows[0].total_traces}, spend_events=${dbAfterClear.rows[0].total_spend}, sample_cleared=${dbAfterClear.rows[0].sample_cleared}`);
  if (dbAfterClear.rows[0].total_traces > 0 || dbAfterClear.rows[0].total_spend > 0 || !dbAfterClear.rows[0].sample_cleared) {
    console.error('FAIL: Sample rows still exist in database after clear!');
    process.exit(1);
  }

  // Check Observe & Spend Dashboards after clear: now empty and is_sample = false
  const obsDashCleared = await req('/api/v1/observe/dashboard', { token: token1 });
  const spendDashCleared = await req('/api/v1/spend/dashboard', { token: token1 });
  console.log(`✓ Observe dashboard after clear: is_sample=${obsDashCleared.data.is_sample}, traces_6h=${obsDashCleared.data.traces_6h}`);
  console.log(`✓ Spend dashboard after clear: is_sample=${spendDashCleared.data.is_sample}, total_30d=$${spendDashCleared.data.spend?.total_30d}`);
  if (obsDashCleared.data.is_sample || obsDashCleared.data.traces_6h !== 0 || spendDashCleared.data.is_sample || spendDashCleared.data.by_model.length !== 0) {
    console.error('FAIL: Dashboard should be empty after clear!');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. RELOAD SAMPLE DATA
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Reload sample data path ---');
  const reload1 = await req('/api/v1/sample-data/reload', { method: 'POST', token: token1 });
  console.log(`✓ Reload sample data: status=${reload1.status}, data=${JSON.stringify(reload1.data)}`);
  if (reload1.status !== 200 || !reload1.data.reloaded) {
    console.error('FAIL: Reload sample data failed!');
    process.exit(1);
  }

  const obsDashReloaded = await req('/api/v1/observe/dashboard', { token: token1 });
  console.log(`✓ Observe dashboard after reload: is_sample=${obsDashReloaded.data.is_sample}, traces_6h=${obsDashReloaded.data.traces_6h}`);
  if (!obsDashReloaded.data.is_sample || obsDashReloaded.data.traces_6h === 0) {
    console.error('FAIL: Dashboard did not reload sample data!');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. FRESH INSTANCE WITH REAL DATA PRESENT: NO SAMPLE DATA INJECTED
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Org with REAL data present shows NO sample data injected ---');
  const user2 = {
    name: 'Bob Real',
    email: `bob-real-${ts}@toolsagent.test`,
    password: 'password123',
    confirm_new_org: true
  };
  const signup2 = await req('/api/auth/signup', { method: 'POST', body: JSON.stringify(user2) });
  const token2 = signup2.data.token;
  const me2 = await req('/api/auth/me', { token: token2 });
  const realOrgId2 = me2.data.user.org_id;
  console.log(`✓ Signed up second user ${user2.email} (Org ID: ${realOrgId2})`);

  // Clear sample data first to simulate org ready for real data, or ingest real data directly
  // Let's test ingest real data directly:
  const realTrace = {
    agent: 'production-agent',
    task: 'Process real customer order #98213',
    model: 'claude-3-5-sonnet-20241022',
    status: 'success',
    duration_ms: 1520,
    cost_usd: 0.0045,
    input_tokens: 1500,
    output_tokens: 450
  };
  const postTrace = await req('/api/v1/observe/traces', {
    method: 'POST',
    token: token2,
    body: JSON.stringify(realTrace)
  });
  console.log(`✓ Posted real trace: status=${postTrace.status}, logged=${postTrace.data.logged}, id=${postTrace.data.id}`);

  // Ingest real spend event
  const realSpend = {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    feature: 'production-checkout',
    input_tokens: 1500,
    output_tokens: 450,
    cost_usd: 0.0045,
    success: true
  };
  const postSpend = await req('/api/v1/spend/events', {
    method: 'POST',
    token: token2,
    body: JSON.stringify(realSpend)
  });
  console.log(`✓ Posted real spend event: status=${postSpend.status}, logged=${postSpend.data.logged}`);

  // Check Observe Dashboard for Bob: ONLY real trace, no sample data!
  const obsDashReal = await req('/api/v1/observe/dashboard', { token: token2 });
  console.log(`✓ Real Org Observe Dashboard: is_sample=${obsDashReal.data.is_sample}, traces_6h=${obsDashReal.data.traces_6h}, cost_6h=${obsDashReal.data.cost_6h}`);
  console.log(`  - Agents reporting: ${obsDashReal.data.agents?.map(a => a.agent).join(', ')}`);
  if (obsDashReal.data.is_sample) {
    console.error('FAIL: Real org has is_sample = true!');
    process.exit(1);
  }
  if (obsDashReal.data.traces_6h !== 1) {
    console.error(`FAIL: Real org expected exactly 1 trace, got ${obsDashReal.data.traces_6h}!`);
    process.exit(1);
  }
  if (obsDashReal.data.agents[0]?.agent !== 'production-agent') {
    console.error(`FAIL: Expected agent to be production-agent, got ${obsDashReal.data.agents[0]?.agent}`);
    process.exit(1);
  }

  // Check Spend Dashboard for Bob: ONLY real spend event, no sample data!
  const spendDashReal = await req('/api/v1/spend/dashboard', { token: token2 });
  console.log(`✓ Real Org Spend Dashboard: is_sample=${spendDashReal.data.is_sample}, total_calls=${spendDashReal.data.spend?.total_calls}, total_30d=$${spendDashReal.data.spend?.total_30d}`);
  console.log(`  - Models in spend: ${spendDashReal.data.by_model?.map(m => m.model).join(', ')}`);
  if (spendDashReal.data.is_sample) {
    console.error('FAIL: Real org spend has is_sample = true!');
    process.exit(1);
  }
  if (Number(spendDashReal.data.spend?.total_calls) !== 1) {
    console.error(`FAIL: Expected 1 call, got ${spendDashReal.data.spend?.total_calls}`);
    process.exit(1);
  }

  // Attempting to reload sample data on an org with real data MUST fail with 400
  const reloadOnReal = await req('/api/v1/sample-data/reload', { method: 'POST', token: token2 });
  console.log(`✓ Attempting reload on org with real data: status=${reloadOnReal.status} (expected 400), error="${reloadOnReal.data.error}"`);
  if (reloadOnReal.status !== 400) {
    console.error('FAIL: Reloading sample data on org with real data should be refused with 400!');
    process.exit(1);
  }

  // Check CSV export for real org
  const csvReal = await req('/api/v1/export/csv', { token: token2 });
  console.log(`✓ Real org CSV export: status=${csvReal.status}, rows count=${csvReal.data.rows?.length}`);
  console.log(`  - Row 1: model=${csvReal.data.rows[0]?.model}, cost=${csvReal.data.rows[0]?.cost}`);
  if (csvReal.data.rows?.length !== 1) {
    console.error('FAIL: Real org CSV export should return exactly 1 real row!');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. TENANT ISOLATION CHECK
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Tenant Isolation between Org 1 and Org 2 ---');
  const org1Traces = await pool.query('SELECT COUNT(*) FROM traces WHERE org_id = $1', [realOrgId1]);
  const org2Traces = await pool.query('SELECT COUNT(*) FROM traces WHERE org_id = $1', [realOrgId2]);
  console.log(`✓ DB check: Org 1 traces = ${org1Traces.rows[0].count} (sample), Org 2 traces = ${org2Traces.rows[0].count} (real)`);

  const tracesOrg2View = await req('/api/v1/observe/traces', { token: token2 });
  console.log(`✓ Org 2 traces view: count=${tracesOrg2View.data.traces?.length}, is_sample=${tracesOrg2View.data.is_sample}`);
  if (tracesOrg2View.data.traces.length !== 1 || tracesOrg2View.data.traces[0].agent !== 'production-agent') {
    console.error('FAIL: Tenant isolation broken!');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('            ALL BACKEND & API TESTS PASSED 100%                 ');
  console.log('================================================================');

  await pool.end();
}

runTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
