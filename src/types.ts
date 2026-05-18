/**
 * Shared type definitions for the Command Code provider extension.
 * Extracted from command-code.ts for reuse across modules.
 */

// ---------------------------------------------------------------------------
// Upstream API types
// ---------------------------------------------------------------------------

export interface CommandCodeContentPart {
  type: string;
  text?: string;
  image?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  arguments?: unknown;
  toolCallId?: string;
  toolName?: string;
  output?: { type: "text" | "error-text"; value: string };
  isError?: boolean;
}

export interface CommandCodeMessage {
  role: "user" | "assistant" | "tool";
  content: string | CommandCodeContentPart[];
}

export interface CommandCodeTool {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface CommandCodeRequest {
  memory: string;
  taste: null;
  skills: string;
  params: {
    tools?: CommandCodeTool[];
    stream: true;
    max_tokens: number;
    temperature?: number;
    system?: string;
    messages: CommandCodeMessage[];
    model: string;
  };
  config: Record<string, unknown>;
}

export interface CommandCodeResponse {
  id?: unknown;
  role?: unknown;
  model?: unknown;
  content?: unknown;
  stop_reason?: unknown;
  usage?: unknown;
  error?: unknown;
  message?: unknown;
}

// ---------------------------------------------------------------------------
// Internal parsed types
// ---------------------------------------------------------------------------

export type ParsedContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; toolCall: import("@mariozechner/pi-ai").ToolCall };

export interface ToolInputAccumulator {
  id: string;
  toolName: string;
  inputText: string;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

export interface CommandCodeRuntimeState {
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Git context
// ---------------------------------------------------------------------------

export interface GitContext {
  isGitRepo: boolean;
  currentBranch: string;
  mainBranch: string;
  gitStatus: string;
  recentCommits: Array<{ hash: string; message: string }>;
  structure: string[];
}

// ---------------------------------------------------------------------------
// Image handling
// ---------------------------------------------------------------------------

export interface CommandCodeImage {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

// ---------------------------------------------------------------------------
// Retry / circuit breaker
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CacheConfig {
  maxSize: number;
  similarityThreshold: number;
  ttlMs: number;
}

export interface CachedResponse {
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CacheEntry extends CachedResponse {
  key: string;
  trigrams: Set<string>;
  accessCount: number;
}

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

export interface BudgetConfig {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
}

export interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  timestamp: number;
}

export interface CostSummary {
  totalCost: number;
  byModel: Record<string, { cost: number; requests: number; inputTokens: number; outputTokens: number }>;
  dailySpend: number;
  monthlySpend: number;
}

export interface BudgetCheck {
  allowed: boolean;
  remainingUsd: number;
  period: "daily" | "monthly";
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  modelId: string;
  error?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

export interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Backpressure
// ---------------------------------------------------------------------------

export interface BackpressureConfig {
  highWaterMark: number;
  yieldSize: number;
}
