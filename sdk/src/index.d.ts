export type Provider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'mistral' | 'groq';
export type AgentStatus = 'running' | 'idle' | 'error' | 'stopped';
export type TraceStatus = 'success' | 'error' | 'warning';

export interface ToolsAgentOptions {
  /** Override API base URL. Must be https://. */
  baseUrl?: string;
  /** Request timeout ms. Default: 10000. */
  timeout?: number;
  /** Log requests. Key values are always redacted. Default: false. */
  debug?: boolean;
}

// ── OBSERVE ──────────────────────────────────────────────────────
export interface TraceStep {
  type:   'think' | 'tool' | 'flag' | 'result' | 'warn';
  label:  string;
  ts?:    string;
  detail?:string;
  code?:  string;
}

export interface TraceInput {
  agent:         string;
  task:          string;
  model?:        string;
  status?:       TraceStatus;
  duration_ms?:  number;
  cost_usd?:     number;
  input_tokens?: number;
  output_tokens?:number;
  flags?:        string[];
  steps?:        TraceStep[];
  metadata?:     Record<string, unknown>;
}

export interface WrapMeta {
  agent:    string;
  task:     string;
  model?:   string;
  provider?:Provider;
}

export interface ObserveDashboard {
  traces_6h:    number;
  success_rate: string;
  halluc_rate:  string;
  avg_latency:  string;
  cost_6h:      string;
  agents:       AgentHealth[];
  volume:       VolumePoint[];
}

export interface AgentHealth {
  name:         string;
  health:       number;
  runs_per_hour:number;
  avg_cost:     string;
  status:       string;
}

export interface VolumePoint {
  t:      string;
  traces: number;
  flags:  number;
}

export declare class ObserveClient {
  trace(trace: TraceInput): Promise<{ logged: boolean }>;
  listTraces(params?: Record<string, string>): Promise<{ traces: TraceInput[] }>;
  dashboard(): Promise<ObserveDashboard>;
  wrap<T>(fn: () => Promise<T>, meta: WrapMeta): Promise<T>;
}

// ── SPEND ────────────────────────────────────────────────────────
export interface SpendEvent {
  provider:      Provider;
  model:         string;
  feature:       string;
  input_tokens?: number;
  output_tokens?:number;
  cost_usd?:     number;
  success?:      boolean;
  metadata?:     Record<string, unknown>;
}

export interface AlertConfig {
  spike_multiplier?: number;
  budget_limit?:     number;
  slack_webhook?:    string;
}

export interface SpendDashboard {
  spend:       { total_30d: string; total_tokens: string; total_calls: string };
  by_provider: Array<{ provider: string; cost: string; tokens: string; calls: string }>;
  by_feature:  Array<{ feature: string; cost: string; calls: string }>;
  waste:       { retry_count: string; retry_cost: string };
  projection?: { month_end: string; daily_burn: string; over_budget: boolean };
}

export interface ProviderKey {
  id:         string;
  provider:   string;
  label:      string;
  created_at: string;
}

export declare class SpendClient {
  track(event: SpendEvent): Promise<{ logged: boolean }>;
  dashboard(range?: '7d' | '30d' | '90d'): Promise<SpendDashboard>;
  connectKey(provider: Provider, apiKey: string, label?: string): Promise<{ id: string; provider: string; connected: boolean }>;
  listKeys(): Promise<{ keys: ProviderKey[] }>;
  deleteKey(keyId: string): Promise<{ deleted: boolean }>;
  configureAlerts(config: AlertConfig): Promise<{ success: boolean }>;
  wrapOpenAI<T>(fn: () => Promise<T>, feature: string, model: string): Promise<T>;
  wrapAnthropic<T>(fn: () => Promise<T>, feature: string, model: string): Promise<T>;
}

// ── DEPLOY ───────────────────────────────────────────────────────
export interface AgentGuardrails {
  pii_detection?:  boolean;
  loop_breaker?:   boolean;
  cost_limit?:     number;
  profanity?:      boolean;
  halluc_check?:   boolean;
}

export interface DeployConfig {
  name:           string;
  model?:         string;
  system_prompt?: string;
  github_url?:    string;
  guardrails?:    AgentGuardrails;
}

export interface Agent {
  id:           string;
  name:         string;
  model:        string;
  status:       AgentStatus;
  runs_today:   number;
  success_rate: string;
  created_at:   string;
}

export interface AgentRun {
  id:         string;
  agent_id:   string;
  task:       string;
  status:     TraceStatus;
  duration_ms:number;
  cost_usd:   number;
  blocks:     number;
  created_at: string;
}

export interface RunOptions {
  context?:  Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export declare class DeployClient {
  listAgents(): Promise<{ agents: Agent[] }>;
  getAgent(id: string): Promise<{ agent: Agent }>;
  deploy(config: DeployConfig): Promise<{ agent: Agent; api_key: string }>;
  run(agentId: string, task: string, options?: RunOptions): Promise<{ run: AgentRun }>;
  getRuns(agentId: string, params?: Record<string, string>): Promise<{ runs: AgentRun[] }>;
  deleteAgent(agentId: string): Promise<{ deleted: boolean }>;
}

// ── MAIN ─────────────────────────────────────────────────────────
export declare class ToolsAgentError extends Error {
  readonly name:       'ToolsAgentError';
  readonly statusCode: number;
  readonly body:       unknown;
  constructor(message: string, statusCode?: number, body?: unknown);
}

export declare class ToolsAgent {
  readonly observe: ObserveClient;
  readonly spend:   SpendClient;
  readonly deploy:  DeployClient;

  /**
   * @param apiKey  Your ToolsAgent API key (starts with ts_)
   * @param options Optional configuration
   */
  constructor(apiKey: string, options?: ToolsAgentOptions);
}
