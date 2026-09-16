'use strict';

/**
 * @toolsagent/sdk
 * Unified SDK for ToolsAgent — Observe · Spend · Deploy
 * https://github.com/Rishflips/Toolsagent.xyz
 * MIT License
 */

const https = require('https');
const SDK_VERSION = '1.0.0';
const DEFAULT_BASE = 'http://localhost:4000';

// Valid providers allowlist
const PROVIDERS = new Set(['openai','anthropic','google','cohere','mistral','groq']);

// Key ID pattern — prevents path traversal
const KEY_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

// Pricing table (per 1K tokens)
const PRICING = {
  'gpt-4o':                     { input: 0.0025,  output: 0.010  },
  'gpt-4o-mini':                { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo':                { input: 0.010,   output: 0.030  },
  'gpt-3.5-turbo':              { input: 0.0005,  output: 0.0015 },
  'claude-3-5-sonnet-20241022': { input: 0.003,   output: 0.015  },
  'claude-3-5-haiku-20241022':  { input: 0.0008,  output: 0.004  },
  'claude-3-opus-20240229':     { input: 0.015,   output: 0.075  },
  'claude-sonnet-4-5':          { input: 0.003,   output: 0.015  },
  'gemini-1.5-pro':             { input: 0.00125, output: 0.005  },
  'gemini-1.5-flash':           { input: 0.000075,output: 0.0003 },
  'command-r-plus':             { input: 0.003,   output: 0.015  },
  'command-r':                  { input: 0.0005,  output: 0.0015 },
};

class ToolsAgentError extends Error {
  constructor(message, statusCode = 0, body = null) {
    super(message);
    this.name       = 'ToolsAgentError';
    this.statusCode = statusCode;
    this.body       = body;
  }
}

// ── HTTP ──────────────────────────────────────────────────────────
function request(apiKey, baseUrl, timeout, debug, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url  = new URL(baseUrl);
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port:     url.port || 443,
      path,
      method,
      headers: {
        'x-api-key':    apiKey,
        'Content-Type': 'application/json',
        'User-Agent':   `toolsagent-js/${SDK_VERSION}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout,
    };

    if (debug) {
      const safeBody = body ? { ...body } : null;
      if (safeBody?.api_key) safeBody.api_key = '[REDACTED]';
      console.log(`[ToolsAgent] ${method} ${baseUrl}${path}`, safeBody || '');
    }

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new ToolsAgentError(parsed.error || `HTTP ${res.statusCode}`, res.statusCode, parsed));
          } else {
            resolve(parsed);
          }
        } catch (_) {
          reject(new ToolsAgentError(`Invalid response`, res.statusCode));
        }
      });
    });

    req.on('error',   err => reject(new ToolsAgentError(err.message)));
    req.on('timeout', ()  => { req.destroy(); reject(new ToolsAgentError(`Timeout after ${timeout}ms`)); });
    if (data) req.write(data);
    req.end();
  });
}

// ── OBSERVE MODULE ────────────────────────────────────────────────
class ObserveClient {
  constructor(cfg) { this._cfg = cfg; }

  _req(method, path, body) {
    const { apiKey, baseUrl, timeout, debug } = this._cfg;
    return request(apiKey, baseUrl, timeout, debug, method, path, body);
  }

  /**
   * Log a trace (agent run) manually.
   * @param {object} trace
   */
  trace(trace) {
    if (!trace.agent)   throw new ToolsAgentError('trace.agent is required');
    if (!trace.task)    throw new ToolsAgentError('trace.task is required');
    return this._req('POST', '/v1/observe/traces', {
      agent:      String(trace.agent),
      task:       String(trace.task),
      model:      trace.model      || 'unknown',
      status:     trace.status     || 'success',
      duration_ms:trace.duration_ms|| 0,
      cost_usd:   Math.max(0, parseFloat(trace.cost_usd) || 0),
      input_tokens: Math.max(0, parseInt(trace.input_tokens) || 0),
      output_tokens:Math.max(0, parseInt(trace.output_tokens)|| 0),
      flags:      Array.isArray(trace.flags) ? trace.flags : [],
      steps:      Array.isArray(trace.steps) ? trace.steps : [],
      metadata:   trace.metadata || {},
    });
  }

  /** Get recent traces */
  listTraces(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this._req('GET', `/v1/observe/traces${q ? `?${q}` : ''}`);
  }

  /** Get dashboard summary */
  dashboard() {
    return this._req('GET', '/v1/observe/dashboard');
  }

  /**
   * Wrap any async LLM call and auto-log the trace.
   * Works with any provider.
   * @param {Function} fn       - Async function that calls your LLM
   * @param {object}   meta     - { agent, task, model, provider }
   */
  async wrap(fn, meta = {}) {
    if (typeof fn !== 'function') throw new ToolsAgentError('fn must be a function');
    const start = Date.now();
    let success = true, result;
    try {
      result = await fn();
    } catch (e) {
      success = false; throw e;
    } finally {
      try {
        const duration_ms = Date.now() - start;
        // Extract tokens from response if available
        const usage = result?.usage || {};
        const input_tokens  = usage.prompt_tokens   || usage.input_tokens  || 0;
        const output_tokens = usage.completion_tokens|| usage.output_tokens || 0;
        const p = PRICING[meta.model] || { input: 0.003, output: 0.015 };
        const cost_usd = (input_tokens * p.input / 1000) + (output_tokens * p.output / 1000);

        await this.trace({
          agent: meta.agent || 'unknown',
          task:  meta.task  || 'unknown',
          model: meta.model || 'unknown',
          status: success ? 'success' : 'error',
          duration_ms, cost_usd: Math.round(cost_usd * 1e6) / 1e6,
          input_tokens, output_tokens,
        }).catch(() => {});
      } catch (_) {}
    }
    return result;
  }
}

// ── SPEND MODULE ──────────────────────────────────────────────────
class SpendClient {
  constructor(cfg) { this._cfg = cfg; }

  _req(method, path, body) {
    const { apiKey, baseUrl, timeout, debug } = this._cfg;
    return request(apiKey, baseUrl, timeout, debug, method, path, body);
  }

  /**
   * Track an AI API usage event.
   * @param {object} event
   */
  track(event) {
    if (!event.provider) throw new ToolsAgentError('event.provider is required');
    if (!event.model)    throw new ToolsAgentError('event.model is required');
    if (!event.feature)  throw new ToolsAgentError('event.feature is required');

    const provider = String(event.provider).trim().toLowerCase();
    if (!PROVIDERS.has(provider)) {
      throw new ToolsAgentError(`Invalid provider "${event.provider}". Must be: ${[...PROVIDERS].join(', ')}`);
    }

    // Sanitize metadata
    const raw = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const metadata = {};
    const FORBIDDEN = new Set(['__proto__','constructor','prototype']);
    let n = 0;
    for (const k of Object.keys(raw)) {
      if (n >= 20 || FORBIDDEN.has(k)) continue;
      metadata[String(k)] = raw[k]; n++;
    }

    return this._req('POST', '/v1/spend/events', {
      provider,
      model:        String(event.model).trim(),
      feature:      String(event.feature).trim(),
      input_tokens: Math.max(0, parseInt(event.input_tokens)  || 0),
      output_tokens:Math.max(0, parseInt(event.output_tokens) || 0),
      cost_usd:     Math.max(0, parseFloat(event.cost_usd)    || 0),
      success:      event.success !== false,
      metadata,
    });
  }

  /** Get spend dashboard */
  dashboard(range = '30d') {
    return this._req('GET', `/v1/spend/dashboard?range=${range}`);
  }

  /**
   * Connect a provider API key for billing sync.
   * Always pass api_key via environment variable.
   */
  connectKey(provider, apiKey, label) {
    if (!provider) throw new ToolsAgentError('provider is required');
    const p = String(provider).trim().toLowerCase();
    if (!PROVIDERS.has(p)) throw new ToolsAgentError(`Invalid provider "${provider}"`);
    if (!apiKey || apiKey.length < 8) throw new ToolsAgentError('api_key is required');
    return this._req('POST', '/v1/spend/keys', {
      provider: p, api_key: apiKey,
      label: label ? String(label).trim().slice(0, 64) : p,
    });
  }

  listKeys()        { return this._req('GET', '/v1/spend/keys'); }
  deleteKey(keyId)  {
    if (!keyId || !KEY_ID_RE.test(String(keyId))) throw new ToolsAgentError('Invalid keyId format');
    return this._req('DELETE', `/v1/spend/keys/${keyId}`);
  }
  configureAlerts(cfg = {}) {
    const webhook = cfg.slack_webhook || '';
    if (webhook && !webhook.startsWith('https://')) throw new ToolsAgentError('slack_webhook must be https://');
    return this._req('POST', '/v1/spend/alerts', {
      spike_multiplier: Math.max(1, parseFloat(cfg.spike_multiplier) || 2),
      budget_limit:     Math.max(0, parseFloat(cfg.budget_limit)     || 100),
      slack_webhook:    webhook,
    });
  }

  /**
   * Wrap an OpenAI call and auto-track spend.
   */
  async wrapOpenAI(fn, feature, model) {
    if (typeof fn !== 'function') throw new ToolsAgentError('fn must be a function');
    let success = true, result;
    try { result = await fn(); } catch(e) { success = false; throw e; }
    finally {
      try {
        const usage = result?.usage || {};
        const input  = Math.max(0, parseInt(usage.prompt_tokens)    || 0);
        const output = Math.max(0, parseInt(usage.completion_tokens) || 0);
        const p      = PRICING[model] || { input: 0.001, output: 0.003 };
        await this.track({ provider:'openai', model, feature, input_tokens:input, output_tokens:output, cost_usd: Math.round((input*p.input/1000+output*p.output/1000)*1e6)/1e6, success }).catch(()=>{});
      } catch(_) {}
    }
    return result;
  }

  /**
   * Wrap an Anthropic call and auto-track spend.
   */
  async wrapAnthropic(fn, feature, model) {
    if (typeof fn !== 'function') throw new ToolsAgentError('fn must be a function');
    let success = true, result;
    try { result = await fn(); } catch(e) { success = false; throw e; }
    finally {
      try {
        const usage = result?.usage || {};
        const input  = Math.max(0, parseInt(usage.input_tokens)  || 0);
        const output = Math.max(0, parseInt(usage.output_tokens) || 0);
        const p      = PRICING[model] || { input: 0.003, output: 0.015 };
        await this.track({ provider:'anthropic', model, feature, input_tokens:input, output_tokens:output, cost_usd: Math.round((input*p.input/1000+output*p.output/1000)*1e6)/1e6, success }).catch(()=>{});
      } catch(_) {}
    }
    return result;
  }
}

// ── DEPLOY MODULE ─────────────────────────────────────────────────
class DeployClient {
  constructor(cfg) { this._cfg = cfg; }

  _req(method, path, body) {
    const { apiKey, baseUrl, timeout, debug } = this._cfg;
    return request(apiKey, baseUrl, timeout, debug, method, path, body);
  }

  /** List deployed agents */
  listAgents()  { return this._req('GET',  '/v1/deploy/agents'); }

  /** Get a specific agent */
  getAgent(id)  {
    if (!id || !KEY_ID_RE.test(String(id))) throw new ToolsAgentError('Invalid agent id');
    return this._req('GET', `/v1/deploy/agents/${id}`);
  }

  /** Deploy a new agent */
  deploy(cfg) {
    if (!cfg.name) throw new ToolsAgentError('cfg.name is required');
    return this._req('POST', '/v1/deploy/agents', {
      name:          String(cfg.name).trim(),
      model:         cfg.model          || 'claude-3-5-sonnet-20241022',
      system_prompt: cfg.system_prompt  || '',
      github_url:    cfg.github_url     || null,
      guardrails:    cfg.guardrails     || { pii_detection:true, loop_breaker:true, cost_limit:0.50 },
    });
  }

  /** Run an agent */
  run(agentId, task, options = {}) {
    if (!agentId || !KEY_ID_RE.test(String(agentId))) throw new ToolsAgentError('Invalid agentId');
    if (!task) throw new ToolsAgentError('task is required');
    return this._req('POST', `/v1/deploy/agents/${agentId}/run`, {
      task: String(task), context: options.context || {}, metadata: options.metadata || {},
    });
  }

  /** Get run history for an agent */
  getRuns(agentId, params = {}) {
    if (!agentId || !KEY_ID_RE.test(String(agentId))) throw new ToolsAgentError('Invalid agentId');
    const q = new URLSearchParams(params).toString();
    return this._req('GET', `/v1/deploy/agents/${agentId}/runs${q ? `?${q}` : ''}`);
  }

  /** Delete an agent */
  deleteAgent(agentId) {
    if (!agentId || !KEY_ID_RE.test(String(agentId))) throw new ToolsAgentError('Invalid agentId');
    return this._req('DELETE', `/v1/deploy/agents/${agentId}`);
  }
}

// ── MAIN CLIENT ───────────────────────────────────────────────────
class ToolsAgent {
  /**
   * Create a ToolsAgent client.
   *
   * @param {string} apiKey  - Your API key (starts with ts_)
   * @param {object} options
   * @param {string} options.baseUrl - Override API base (default: production)
   * @param {number} options.timeout - Request timeout ms (default: 10000)
   * @param {boolean} options.debug  - Log requests (key values redacted)
   *
   * @example
   * const ta = new ToolsAgent(process.env.TOOLSAGENT_API_KEY)
   *
   * // Observe module
   * await ta.observe.trace({ agent:'my-agent', task:'summarise', model:'gpt-4o' })
   *
   * // Spend module
   * await ta.spend.track({ provider:'openai', model:'gpt-4o', feature:'chat', cost_usd:0.0041 })
   *
   * // Deploy module
   * await ta.deploy.run('ag_abc123', 'Summarise this document')
   */
  constructor(apiKey, options = {}) {
    if (!apiKey || typeof apiKey !== 'string') throw new ToolsAgentError('apiKey is required');
    if (!apiKey.startsWith('ts_'))             throw new ToolsAgentError('Invalid API key — must start with ts_');

    // API keys travel in a header, so plaintext transport is only tolerable
    // when the request never leaves the machine.
    const base = (options.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base);
    if (!base.startsWith('https://') && !isLocal) {
      throw new ToolsAgentError(
        'baseUrl must use HTTPS (http:// is allowed only for localhost / 127.0.0.1)'
      );
    }

    this._cfg = {
      apiKey,
      baseUrl: base,
      timeout: options.timeout || 10000,
      debug:   options.debug   || false,
    };

    this.observe = new ObserveClient(this._cfg);
    this.spend   = new SpendClient(this._cfg);
    this.deploy  = new DeployClient(this._cfg);
  }

  toString() {
    return `ToolsAgent(key=ts_***${this._cfg.apiKey.slice(-4)})`;
  }
}

module.exports = { ToolsAgent, ToolsAgentError };
