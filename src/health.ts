/**
 * Lightweight health check for the Command Code upstream API.
 *
 * Sends a minimal request to verify the API endpoint is reachable
 * and responding. Used for diagnostics and circuit breaker awareness.
 */

import type { HealthStatus } from "./types.js";

const HEALTH_TIMEOUT_MS = 10_000;

/**
 * Perform a lightweight health check against the upstream API.
 *
 * Sends a small models list or root request to verify connectivity.
 * Returns a HealthStatus with latency measurement.
 */
export async function performHealthCheck(
  upstreamUrl: string,
  apiKey: string,
  modelId: string,
): Promise<HealthStatus> {
  const timestamp = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const url = `${upstreamUrl.replace(/\/+$/, "")}/alpha/generate`;

    const start = performance.now();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        memory: "",
        taste: null,
        skills: "",
        params: {
          stream: false,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
          model: modelId,
        },
        config: {},
      }),
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - start);

    // Any response (even error codes) means the API is reachable
    return {
      healthy: response.status < 500,
      latencyMs,
      modelId,
      timestamp,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: -1,
      modelId,
      error: error instanceof Error ? error.message : "Unknown health check error",
      timestamp,
    };
  } finally {
    clearTimeout(timeout);
  }
}
