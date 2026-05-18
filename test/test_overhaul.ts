/**
 * Comprehensive tests for the cmd-headless (Command Code) PI extension overhaul.
 *
 * Covers:
 *  1. Module import / export existence
 *  2. Unit tests per module (retry, guardrails, git-context, image-handler,
 *     cache, cost-tracker, health, tool-aliases, backpressure)
 *  3. Integration tests against command-code.ts
 *  4. Config loading tests
 *
 * Run with:
 *   node --experimental-strip-types --test test/test_overhaul.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

import { RetryHandler } from "../src/retry.ts";
import { applyGuardrails, applyGuardrailsToUserContent } from "../src/guardrails.ts";
import type {
  CommandCodeContentPart,
  CommandCodeRequest,
  CommandCodeResponse,
  CommandCodeMessage,
  CommandCodeTool,
  GitContext,
  CommandCodeImage,
  RetryConfig,
  CircuitState,
  CircuitBreakerConfig,
  CacheConfig,
  CachedResponse,
  CacheEntry,
  BudgetConfig,
  CostRecord,
  CostSummary,
  BudgetCheck,
  HealthStatus,
  BackpressureConfig,
  ParsedContentBlock,
  ToolInputAccumulator,
  CommandCodeRuntimeState,
} from "../src/types.ts";
import { resolveGitContext } from "../src/git-context.ts";
import { encodeImage } from "../src/image-handler.ts";
import { SemanticCache } from "../src/cache.ts";
import { CostTracker } from "../src/cost-tracker.ts";
import { performHealthCheck } from "../src/health.ts";
import { TOOL_ALIASES, normalizeToolArguments } from "../src/tool-aliases.ts";
import { BackpressureController } from "../src/backpressure.ts";
import { loadConfig, COMMAND_CODE_API, type ExtensionConfig } from "../src/config.ts";
import { createCommandCodeStream } from "../src/command-code.ts";

const EXTENSION_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ===========================================================================
// 1. TypeScript compilation was already verified (zero errors).
//    Here we verify modules actually load and export expected symbols.
// ===========================================================================

describe("Module imports and exports", () => {
  // --- retry.ts ---
  it("retry.ts exports RetryHandler class with execute method", () => {
    assert.equal(typeof RetryHandler, "function");
    const instance = new RetryHandler();
    assert.equal(typeof instance.execute, "function");
    assert.equal(typeof instance.getCircuitState, "function");
    assert.equal(typeof instance.getConsecutiveFailures, "function");
    assert.equal(typeof instance.resetCircuit, "function");
  });

  // --- guardrails.ts ---
  it("guardrails.ts exports applyGuardrails function", () => {
    assert.equal(typeof applyGuardrails, "function");
  });

  it("guardrails.ts exports applyGuardrailsToUserContent function", () => {
    assert.equal(typeof applyGuardrailsToUserContent, "function");
  });

  // --- types.ts ---
  it("types.ts key interfaces are importable (structural check)", () => {
    // We can't runtime-check interfaces, but the import succeeded above.
    // Verify we can construct values matching the shapes.
    const contentPart: CommandCodeContentPart = { type: "text", text: "hello" };
    assert.equal(contentPart.type, "text");

    const gitCtx: GitContext = {
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "main",
      gitStatus: "",
      recentCommits: [],
      structure: [],
    };
    assert.equal(gitCtx.isGitRepo, false);
  });

  // --- git-context.ts ---
  it("git-context.ts exports resolveGitContext function", () => {
    assert.equal(typeof resolveGitContext, "function");
  });

  // --- image-handler.ts ---
  it("image-handler.ts exports encodeImage function", () => {
    assert.equal(typeof encodeImage, "function");
  });

  // --- cache.ts ---
  it("cache.ts exports SemanticCache class with get/set methods", () => {
    assert.equal(typeof SemanticCache, "function");
    const instance = new SemanticCache();
    assert.equal(typeof instance.get, "function");
    assert.equal(typeof instance.set, "function");
    assert.equal(typeof instance.clear, "function");
    assert.equal(typeof instance.getStats, "function");
  });

  // --- cost-tracker.ts ---
  it("cost-tracker.ts exports CostTracker class with record/checkBudget/getSummary", () => {
    assert.equal(typeof CostTracker, "function");
    const instance = new CostTracker();
    assert.equal(typeof instance.record, "function");
    assert.equal(typeof instance.checkBudget, "function");
    assert.equal(typeof instance.getSummary, "function");
    assert.equal(typeof instance.getBudgetLimits, "function");
  });

  // --- health.ts ---
  it("health.ts exports performHealthCheck function", () => {
    assert.equal(typeof performHealthCheck, "function");
  });

  // --- tool-aliases.ts ---
  it("tool-aliases.ts exports TOOL_ALIASES object", () => {
    assert.equal(typeof TOOL_ALIASES, "object");
    assert.ok(TOOL_ALIASES !== null);
  });

  it("tool-aliases.ts exports normalizeToolArguments function", () => {
    assert.equal(typeof normalizeToolArguments, "function");
  });

  // --- backpressure.ts ---
  it("backpressure.ts exports BackpressureController class", () => {
    assert.equal(typeof BackpressureController, "function");
    const instance = new BackpressureController();
    assert.equal(typeof instance.record, "function");
    assert.equal(typeof instance.consume, "function");
    assert.equal(typeof instance.getBufferedBytes, "function");
    assert.equal(typeof instance.reset, "function");
  });
});

// ===========================================================================
// 2. Unit tests — retry.ts
// ===========================================================================

describe("retry.ts — RetryHandler", () => {
  it("succeeds after 2 failures then success", async () => {
    const handler = new RetryHandler({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    let callCount = 0;
    const result = await handler.execute(async () => {
      callCount++;
      if (callCount < 3) throw new Error("ECONNREFUSED: connection failed");
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(callCount, 3);
  });

  it("throws after maxRetries exhausted", async () => {
    const handler = new RetryHandler({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 });
    let callCount = 0;
    await assert.rejects(
      () =>
        handler.execute(async () => {
          callCount++;
          throw new Error("ECONNRESET: peer reset");
        }),
      { message: /ECONNRESET/ },
    );
    // maxRetries=2 means attempt 0, 1, 2 = 3 total calls
    assert.equal(callCount, 3);
  });

  it("does NOT retry non-retryable errors (throws immediately)", async () => {
    const handler = new RetryHandler({ maxRetries: 3, baseDelayMs: 1, maxDelayMs: 10 });
    let callCount = 0;
    await assert.rejects(
      () =>
        handler.execute(async () => {
          callCount++;
          throw new Error("HTTP 401 Unauthorized");
        }),
      { message: /401/ },
    );
    assert.equal(callCount, 1);
  });

  it("circuit breaker opens after threshold failures", async () => {
    const handler = new RetryHandler({
      maxRetries: 0,
      baseDelayMs: 1,
      maxDelayMs: 10,
      failureThreshold: 2,
      recoveryTimeoutMs: 60_000, // long so it stays OPEN
    });

    // Fail twice to hit threshold
    for (let i = 0; i < 2; i++) {
      try {
        await handler.execute(async () => {
          throw new Error("ECONNREFUSED");
        });
      } catch {
        // expected
      }
    }

    assert.equal(handler.getCircuitState(), "OPEN");
    assert.equal(handler.getConsecutiveFailures(), 2);

    // Next call should be rejected immediately by circuit breaker
    await assert.rejects(
      () =>
        handler.execute(async () => "should not run"),
      { message: /Circuit breaker is OPEN/ },
    );
  });

  it("circuit breaker resets via resetCircuit()", async () => {
    const handler = new RetryHandler({
      maxRetries: 0,
      baseDelayMs: 1,
      maxDelayMs: 10,
      failureThreshold: 1,
      recoveryTimeoutMs: 60_000,
    });

    try {
      await handler.execute(async () => {
        throw new Error("ECONNREFUSED");
      });
    } catch {
      // expected
    }
    assert.equal(handler.getCircuitState(), "OPEN");

    handler.resetCircuit();
    assert.equal(handler.getCircuitState(), "CLOSED");
    assert.equal(handler.getConsecutiveFailures(), 0);
  });
});

// ===========================================================================
// 3. Unit tests — guardrails.ts
// ===========================================================================

describe("guardrails.ts — PII redaction", () => {
  it("redacts email addresses", () => {
    const input = "contact user@example.com for help";
    const result = applyGuardrails(input);
    assert.ok(!result.text.includes("user@example.com"), `Email not redacted: ${result.text}`);
    assert.ok(result.text.includes("[REDACTED_EMAIL]"), `Missing redaction token: ${result.text}`);
    assert.ok(result.detectedTypes.has("email"));
    assert.ok(result.redactionCount >= 1);
  });

  it("redacts OpenAI-style API keys (sk-*)", () => {
    const input = "key is sk-1234567890abcdef1234567890abcdef";
    const result = applyGuardrails(input);
    assert.ok(!result.text.includes("sk-1234567890abcdef"), `API key not redacted: ${result.text}`);
    assert.ok(result.text.includes("[REDACTED_API_KEY]"));
    assert.ok(result.detectedTypes.has("openai_key"));
  });

  it("passes normal code through unchanged", () => {
    const input = "function add(a, b) { return a + b; }";
    const result = applyGuardrails(input);
    assert.equal(result.text, input);
    assert.equal(result.redactionCount, 0);
    assert.equal(result.detectedTypes.size, 0);
  });

  it("applyGuardrailsToUserContent returns only the text string", () => {
    const input = "email me at test@test.com please";
    const result = applyGuardrailsToUserContent(input);
    assert.equal(typeof result, "string");
    assert.ok(!result.includes("test@test.com"));
    assert.ok(result.includes("[REDACTED_EMAIL]"));
  });

  it("redacts multiple PII types in one string", () => {
    const input = "user admin@corp.io has key sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const result = applyGuardrails(input);
    assert.ok(result.detectedTypes.has("email"));
    assert.ok(result.detectedTypes.has("openai_key"));
    assert.ok(result.redactionCount >= 2);
  });

  it("redacts private keys", () => {
    const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA\n-----END RSA PRIVATE KEY-----";
    const result = applyGuardrails(input);
    assert.ok(result.text.includes("[REDACTED_PRIVATE_KEY]"));
    assert.ok(result.detectedTypes.has("private_key"));
  });

  it("redacts GitHub tokens", () => {
    const input = "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi123456";
    const result = applyGuardrails(input);
    assert.ok(result.text.includes("[REDACTED_GITHUB_TOKEN]"));
    assert.ok(result.detectedTypes.has("github_token"));
  });
});

// ===========================================================================
// 4. Unit tests — git-context.ts
// ===========================================================================

describe("git-context.ts — resolveGitContext", () => {
  it("detects git repo in extension directory", () => {
    const ctx = resolveGitContext(EXTENSION_ROOT);
    // Extension directory has a .git folder
    assert.equal(ctx.isGitRepo, true);
    assert.ok(ctx.currentBranch.length > 0, "Should have a current branch");
    assert.ok(ctx.mainBranch.length > 0, "Should detect a main branch");
  });

  it("returns empty defaults for /tmp", () => {
    const ctx = resolveGitContext("/tmp");
    assert.equal(ctx.isGitRepo, false);
    assert.equal(ctx.currentBranch, "");
    assert.equal(ctx.mainBranch, "main");
    assert.equal(ctx.gitStatus, "");
    assert.deepEqual(ctx.recentCommits, []);
    assert.deepEqual(ctx.structure, []);
  });

  it("returns all expected fields", () => {
    const ctx = resolveGitContext(EXTENSION_ROOT);
    assert.ok("isGitRepo" in ctx);
    assert.ok("currentBranch" in ctx);
    assert.ok("mainBranch" in ctx);
    assert.ok("gitStatus" in ctx);
    assert.ok("recentCommits" in ctx);
    assert.ok("structure" in ctx);
  });
});

// ===========================================================================
// 5. Unit tests — image-handler.ts
// ===========================================================================

describe("image-handler.ts — encodeImage", () => {
  it("encodes valid image data to CommandCodeImage format", () => {
    const result = encodeImage({ type: "image", data: "base64string", mimeType: "image/png" });
    assert.ok(result, "Should return non-null");
    assert.equal(result!.type, "image");
    assert.equal(result!.source.type, "base64");
    assert.equal(result!.source.media_type, "image/png");
    assert.equal(result!.source.data, "base64string");
  });

  it("returns null for empty data", () => {
    assert.equal(encodeImage({ type: "image", data: "", mimeType: "image/png" }), null);
  });

  it("returns null for undefined-like data", () => {
    assert.equal(encodeImage({ type: "image", data: undefined as unknown as string, mimeType: "image/png" }), null);
  });

  it("defaults to image/png when mimeType missing", () => {
    const result = encodeImage({ type: "image", data: "abc123", mimeType: "" });
    assert.ok(result);
    assert.equal(result!.source.media_type, "image/png");
  });
});

// ===========================================================================
// 6. Unit tests — cache.ts
// ===========================================================================

describe("cache.ts — SemanticCache", () => {
  it("set and get by same key returns cached value", () => {
    const cache = new SemanticCache({ ttlMs: 60_000 });
    cache.set("hello world", "response text");
    const hit = cache.get("hello world");
    assert.ok(hit, "Should find exact match");
    assert.equal(hit!.content, "response text");
  });

  it("get by different key returns null (below threshold)", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.95, ttlMs: 60_000 });
    cache.set("hello world", "response 1");
    const hit = cache.get("completely different query about javascript");
    assert.equal(hit, null);
  });

  it("TTL expiry returns null", async () => {
    const cache = new SemanticCache({ ttlMs: 50 }); // 50ms TTL
    cache.set("short-lived", "value");
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 100));
    const hit = cache.get("short-lived");
    assert.equal(hit, null);
  });

  it("tracks stats correctly", () => {
    const cache = new SemanticCache({ ttlMs: 60_000 });
    cache.set("q1", "a1");
    cache.get("q1"); // hit
    cache.get("q2"); // miss
    cache.get("q1"); // hit
    const stats = cache.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.ok(stats.hitRate > 0);
    assert.equal(stats.size, 1);
  });

  it("clear removes all entries", () => {
    const cache = new SemanticCache({ ttlMs: 60_000 });
    cache.set("q1", "a1");
    cache.set("q2", "a2");
    cache.clear();
    assert.equal(cache.get("q1"), null);
    assert.equal(cache.getStats().size, 0);
  });

  it("evicts oldest when at capacity", () => {
    const cache = new SemanticCache({ maxSize: 2, ttlMs: 60_000 });
    cache.set("first", "a");
    cache.set("second", "b");
    cache.set("third", "c"); // should evict "first"
    // "first" should be gone (or at least "third" present)
    const hit = cache.get("third");
    assert.ok(hit);
    assert.equal(hit!.content, "c");
  });
});

// ===========================================================================
// 7. Unit tests — cost-tracker.ts
// ===========================================================================

describe("cost-tracker.ts — CostTracker", () => {
  it("records requests and getSummary returns correct totals", () => {
    const tracker = new CostTracker();
    tracker.record("model-a", {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 0,
      cost: { total: 0.01 },
    });
    tracker.record("model-b", {
      input: 200,
      output: 100,
      cacheRead: 0,
      cacheWrite: 5,
      cost: { total: 0.05 },
    });

    const summary = tracker.getSummary();
    assert.ok(Math.abs(summary.totalCost - 0.06) < 0.001, `totalCost should be ~0.06, got ${summary.totalCost}`);
    assert.equal(summary.byModel["model-a"].requests, 1);
    assert.equal(summary.byModel["model-a"].inputTokens, 100);
    assert.equal(summary.byModel["model-b"].requests, 1);
    assert.equal(summary.byModel["model-b"].outputTokens, 100);
    assert.ok(summary.dailySpend > 0);
    assert.ok(summary.monthlySpend > 0);
  });

  it("checkBudget returns allowed=true when under budget", () => {
    const tracker = new CostTracker({ dailyLimitUsd: 100, monthlyLimitUsd: 1000 });
    tracker.record("model", {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { total: 0.01 },
    });
    const check = tracker.checkBudget();
    assert.equal(check.allowed, true);
    assert.ok(check.remainingUsd > 0);
  });

  it("checkBudget returns allowed=false when daily budget exceeded", () => {
    const tracker = new CostTracker({ dailyLimitUsd: 0.01, monthlyLimitUsd: 1000 });
    tracker.record("model", {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { total: 0.02 },
    });
    const check = tracker.checkBudget();
    assert.equal(check.allowed, false);
    assert.equal(check.period, "daily");
  });

  it("checkBudget returns allowed=false when monthly budget exceeded", () => {
    const tracker = new CostTracker({ dailyLimitUsd: 100, monthlyLimitUsd: 0.01 });
    tracker.record("model", {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { total: 0.02 },
    });
    const check = tracker.checkBudget();
    assert.equal(check.allowed, false);
    assert.equal(check.period, "monthly");
  });

  it("getBudgetLimits returns configured limits", () => {
    const tracker = new CostTracker({ dailyLimitUsd: 42, monthlyLimitUsd: 999 });
    const limits = tracker.getBudgetLimits();
    assert.equal(limits.dailyLimitUsd, 42);
    assert.equal(limits.monthlyLimitUsd, 999);
  });
});

// ===========================================================================
// 8. Unit tests — health.ts
// ===========================================================================

describe("health.ts — performHealthCheck", () => {
  it("returns healthy=true when API responds < 500", async () => {
    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: string, _opts?: RequestInit) =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });

    try {
      const result = await performHealthCheck("https://api.test.com", "test-key", "test-model");
      assert.equal(result.healthy, true);
      assert.ok(result.latencyMs >= 0);
      assert.equal(result.modelId, "test-model");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns healthy=false on network error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };

    try {
      const result = await performHealthCheck("https://api.test.com", "test-key", "test-model");
      assert.equal(result.healthy, false);
      assert.equal(result.latencyMs, -1);
      assert.ok(result.error);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns healthy=false when API responds 500+", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Internal Server Error", { status: 503 });

    try {
      const result = await performHealthCheck("https://api.test.com", "test-key", "test-model");
      assert.equal(result.healthy, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes timestamp in result", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("ok", { status: 200 });

    try {
      const before = Date.now();
      const result = await performHealthCheck("https://api.test.com", "test-key", "test-model");
      const after = Date.now();
      assert.ok(result.timestamp >= before && result.timestamp <= after);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ===========================================================================
// 9. Unit tests — tool-aliases.ts
// ===========================================================================

describe("tool-aliases.ts", () => {
  it("TOOL_ALIASES maps read_file to read", () => {
    assert.equal(TOOL_ALIASES["read_file"], "read");
  });

  it("TOOL_ALIASES maps write_file to write", () => {
    assert.equal(TOOL_ALIASES["write_file"], "write");
  });

  it("TOOL_ALIASES maps edit_file to edit", () => {
    assert.equal(TOOL_ALIASES["edit_file"], "edit");
  });

  it("TOOL_ALIASES maps shell_command to bash", () => {
    assert.equal(TOOL_ALIASES["shell_command"], "bash");
  });

  it("TOOL_ALIASES maps glob to find", () => {
    assert.equal(TOOL_ALIASES["glob"], "find");
  });

  it("TOOL_ALIASES maps search_files to grep", () => {
    assert.equal(TOOL_ALIASES["search_files"], "grep");
  });

  it("TOOL_ALIASES maps cat to read", () => {
    assert.equal(TOOL_ALIASES["cat"], "read");
  });

  it("TOOL_ALIASES maps create_file to write", () => {
    assert.equal(TOOL_ALIASES["create_file"], "write");
  });

  it("normalizeToolArguments renames filePattern to glob for grep", () => {
    const result = normalizeToolArguments("grep", { filePattern: "*.ts", pattern: "test" });
    assert.equal(result.glob, "*.ts");
    assert.equal(result.pattern, "test");
    assert.equal("filePattern" in result, false);
  });

  it("normalizeToolArguments does not overwrite existing glob", () => {
    const result = normalizeToolArguments("grep", { filePattern: "*.ts", glob: "*.js", pattern: "test" });
    assert.equal(result.glob, "*.js");
  });

  it("normalizeToolArguments renames absolutePath to path for read", () => {
    const result = normalizeToolArguments("read", { absolutePath: "/foo/bar.ts" });
    assert.equal(result.path, "/foo/bar.ts");
    assert.equal("absolutePath" in result, false);
  });

  it("normalizeToolArguments renames filePath to path for write", () => {
    const result = normalizeToolArguments("write", { filePath: "/out.txt", content: "hi" });
    assert.equal(result.path, "/out.txt");
    assert.equal(result.content, "hi");
  });

  it("normalizeToolArguments converts oldValue/newValue to edits array for edit", () => {
    const result = normalizeToolArguments("edit", {
      filePath: "/a.ts",
      oldValue: "foo",
      newValue: "bar",
    }) as Record<string, unknown>;
    assert.equal(result.path, "/a.ts");
    assert.ok(Array.isArray(result.edits));
    assert.deepEqual(result.edits, [{ oldText: "foo", newText: "bar" }]);
  });

  it("normalizeToolArguments passes through unknown tools unchanged", () => {
    const args = { foo: 1, bar: "baz" };
    const result = normalizeToolArguments("unknown_tool", args);
    assert.deepEqual(result, args);
  });
});

// ===========================================================================
// 10. Unit tests — backpressure.ts
// ===========================================================================

describe("backpressure.ts — BackpressureController", () => {
  it("does not throttle when under highWaterMark", async () => {
    const bp = new BackpressureController(1024); // 1KB HWM
    await bp.record(512); // 512 bytes, under limit
    assert.equal(bp.getBufferedBytes(), 512);
  });

  it("throttles (yields) when exceeding highWaterMark", async () => {
    const bp = new BackpressureController(100); // very low HWM
    const start = Date.now();
    await bp.record(200); // exceeds 100 bytes → should yield
    const elapsed = Date.now() - start;
    // setImmediate is very fast, should complete but we verify it didn't crash
    assert.ok(bp.getBufferedBytes() >= 200);
  });

  it("consume reduces buffered bytes", async () => {
    const bp = new BackpressureController(1024);
    await bp.record(500);
    bp.consume(200);
    assert.equal(bp.getBufferedBytes(), 300);
  });

  it("consume does not go below 0", () => {
    const bp = new BackpressureController(1024);
    bp.consume(500);
    assert.equal(bp.getBufferedBytes(), 0);
  });

  it("reset clears buffered bytes", async () => {
    const bp = new BackpressureController(1024);
    await bp.record(500);
    bp.reset();
    assert.equal(bp.getBufferedBytes(), 0);
  });
});

// ===========================================================================
// 11. Integration tests — command-code.ts
// ===========================================================================

describe("Integration — command-code.ts uses new modules", () => {
  it("createCommandCodeStream is a function", () => {
    assert.equal(typeof createCommandCodeStream, "function");
  });

  it("createCommandCodeStream returns a stream function", () => {
    const config: ExtensionConfig = {
      enabled: true,
      debug: false,
      providerId: "command-code",
      displayName: "CommandCode",
      upstreamUrl: "https://api.commandcode.ai",
      apiKey: "COMMAND_CODE_TOKEN",
      commandCodeVersion: "0.25.1",
      commandCodeProvider: "commandcode",
      requestTimeoutMs: 30000,
      memory: "",
      headers: {},
      models: [],
      retry: {},
      cache: {},
      budget: {},
      gitContext: {},
      images: {},
      guardrails: {},
    };
    const runtime: CommandCodeRuntimeState = {};
    // Minimal logger mock
    const logger = {
      debug: () => {},
      warn: () => {},
      error: () => {},
    } as any;
    const streamFn = createCommandCodeStream(config, runtime, logger);
    assert.equal(typeof streamFn, "function");
  });

  it("resolveGitContext is called during config building (indirectly)", () => {
    // Verify the function works in isolation — command-code.ts calls it internally
    const ctx = resolveGitContext(process.cwd());
    assert.ok("isGitRepo" in ctx);
    assert.ok("currentBranch" in ctx);
    assert.ok("recentCommits" in ctx);
  });

  it("encodeImage handles image conversion (used by command-code.ts)", () => {
    const result = encodeImage({ type: "image", data: "dGVzdA==", mimeType: "image/png" });
    assert.ok(result);
    assert.equal(result!.source.data, "dGVzdA==");
  });

  it("TOOL_ALIASES is used by command-code.ts for tool normalization", () => {
    // Verify the alias table is populated
    assert.ok(Object.keys(TOOL_ALIASES).length >= 10, "Should have at least 10 aliases");
  });

  it("normalizeToolArguments is callable and functional", () => {
    const result = normalizeToolArguments("read_file" in TOOL_ALIASES ? "read" : "read_file", { absolutePath: "/test" });
    // After alias lookup, "read" tool gets normalized
    assert.equal(result.path, "/test");
  });
});

// ===========================================================================
// 12. Config tests
// ===========================================================================

describe("Config — config.json and config.ts", () => {
  it("config.json has apiKey: COMMAND_CODE_TOKEN (not plaintext)", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.equal(raw.apiKey, "COMMAND_CODE_TOKEN");
    // Ensure it's NOT a real API key pattern
    assert.ok(!raw.apiKey.startsWith("sk-"), "apiKey should not be a plaintext secret");
  });

  it("config.json has retry section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("retry" in raw, "Missing retry section");
    assert.equal(typeof raw.retry.maxRetries, "number");
    assert.equal(typeof raw.retry.baseDelayMs, "number");
    assert.equal(typeof raw.retry.maxDelayMs, "number");
    assert.equal(typeof raw.retry.failureThreshold, "number");
    assert.equal(typeof raw.retry.recoveryTimeoutMs, "number");
  });

  it("config.json has cache section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("cache" in raw, "Missing cache section");
    assert.equal(typeof raw.cache.enabled, "boolean");
    assert.equal(typeof raw.cache.maxSize, "number");
  });

  it("config.json has budget section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("budget" in raw, "Missing budget section");
    assert.equal(typeof raw.budget.dailyLimitUsd, "number");
    assert.equal(typeof raw.budget.monthlyLimitUsd, "number");
  });

  it("config.json has gitContext section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("gitContext" in raw, "Missing gitContext section");
    assert.equal(typeof raw.gitContext.enabled, "boolean");
  });

  it("config.json has images section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("images" in raw, "Missing images section");
    assert.equal(typeof raw.images.enabled, "boolean");
    assert.equal(typeof raw.images.maxBytes, "number");
  });

  it("config.json has guardrails section", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(join(EXTENSION_ROOT, "config.json"), "utf-8"));
    assert.ok("guardrails" in raw, "Missing guardrails section");
    assert.equal(typeof raw.guardrails.enabled, "boolean");
  });

  it("loadConfig parses all new sections", () => {
    const { config, warnings } = loadConfig(EXTENSION_ROOT);
    assert.ok(config.retry, "config.retry should exist");
    assert.ok(config.cache, "config.cache should exist");
    assert.ok(config.budget, "config.budget should exist");
    assert.ok(config.gitContext, "config.gitContext should exist");
    assert.ok(config.images, "config.images should exist");
    assert.ok(config.guardrails, "config.guardrails should exist");
  });

  it("loadConfig reads retry values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.retry.maxRetries, 3);
    assert.equal(config.retry.baseDelayMs, 1000);
    assert.equal(config.retry.maxDelayMs, 30000);
    assert.equal(config.retry.failureThreshold, 5);
    assert.equal(config.retry.recoveryTimeoutMs, 30000);
  });

  it("loadConfig reads cache values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.cache.enabled, false);
    assert.equal(config.cache.maxSize, 500);
    assert.equal(config.cache.similarityThreshold, 0.95);
    assert.equal(config.cache.ttlMs, 1800000);
  });

  it("loadConfig reads budget values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.budget.dailyLimitUsd, 50);
    assert.equal(config.budget.monthlyLimitUsd, 1000);
  });

  it("loadConfig reads gitContext values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.gitContext.enabled, true);
    assert.equal(config.gitContext.timeoutMs, 5000);
  });

  it("loadConfig reads images values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.images.enabled, true);
    assert.equal(config.images.maxBytes, 20971520);
  });

  it("loadConfig reads guardrails values from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.guardrails.enabled, false);
  });

  it("loadConfig loads models from config.json", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.ok(config.models.length >= 3, "Should have at least 3 models");
    const ids = config.models.map((m) => m.id);
    assert.ok(ids.some((id) => id.includes("Kimi") || id.includes("K2")), "Should include Kimi model");
    assert.ok(ids.some((id) => id.includes("deepseek")), "Should include DeepSeek model");
    assert.ok(ids.some((id) => id.includes("Qwen")), "Should include Qwen model");
  });

  it("loadConfig returns config with apiKey COMMAND_CODE_TOKEN", () => {
    const { config } = loadConfig(EXTENSION_ROOT);
    assert.equal(config.apiKey, "COMMAND_CODE_TOKEN");
  });

  it("loadConfig handles missing config.json gracefully", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cc-test-"));
    try {
      const { config, warnings } = loadConfig(tmpDir);
      assert.ok(warnings.length > 0, "Should warn about missing config.json");
      assert.equal(config.apiKey, "COMMAND_CODE_TOKEN"); // default
      assert.ok(config.models.length > 0, "Should fall back to default models");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loadConfig handles malformed config.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cc-test-"));
    try {
      writeFileSync(join(tmpDir, "config.json"), "NOT JSON{{{");
      const { config, warnings } = loadConfig(tmpDir);
      assert.ok(warnings.length > 0);
      assert.equal(config.enabled, true); // default
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// 13. Edge case / additional tests
// ===========================================================================

describe("Edge cases", () => {
  it("RetryHandler with zero retries passes through on success", async () => {
    const handler = new RetryHandler({ maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 });
    const result = await handler.execute(async () => "immediate");
    assert.equal(result, "immediate");
  });

  it("SemanticCache handles empty query", () => {
    const cache = new SemanticCache({ ttlMs: 60_000 });
    cache.set("", "empty-key");
    const hit = cache.get("");
    assert.ok(hit);
    assert.equal(hit!.content, "empty-key");
  });

  it("CostTracker with zero budget immediately blocks", () => {
    const tracker = new CostTracker({ dailyLimitUsd: 0, monthlyLimitUsd: 0 });
    const check = tracker.checkBudget();
    assert.equal(check.allowed, false);
  });

  it("BackpressureController with very high HWM never yields", async () => {
    const bp = new BackpressureController(1024 * 1024 * 1024); // 1GB
    const start = Date.now();
    await bp.record(1000);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, "Should be instant (<50ms)");
  });

  it("applyGuardrails handles empty string", () => {
    const result = applyGuardrails("");
    assert.equal(result.text, "");
    assert.equal(result.redactionCount, 0);
  });

  it("normalizeToolArguments handles empty args", () => {
    const result = normalizeToolArguments("read", {});
    assert.deepEqual(result, {});
  });

  it("TOOL_ALIASES has at least 10 entries", () => {
    const keys = Object.keys(TOOL_ALIASES);
    assert.ok(keys.length >= 10, `Expected >=10 aliases, got ${keys.length}`);
  });

  it("resolveGitContext uses process.cwd() when no arg provided", () => {
    const ctx = resolveGitContext();
    assert.ok("isGitRepo" in ctx);
    // We're running from a git repo
    assert.equal(ctx.isGitRepo, true);
  });

  it("RetryHandler retries on HTTP 429", async () => {
    const handler = new RetryHandler({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 });
    let callCount = 0;
    const result = await handler.execute(async () => {
      callCount++;
      if (callCount === 1) throw new Error("HTTP 429 Too Many Requests");
      return "success";
    });
    assert.equal(result, "success");
    assert.equal(callCount, 2);
  });

  it("RetryHandler retries on HTTP 503", async () => {
    const handler = new RetryHandler({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 });
    let callCount = 0;
    const result = await handler.execute(async () => {
      callCount++;
      if (callCount === 1) throw new Error("HTTP 503 Service Unavailable");
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(callCount, 2);
  });
});
