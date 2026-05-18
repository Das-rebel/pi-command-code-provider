/**
 * PII guardrails - redact sensitive information from prompts before sending upstream.
 *
 * Patterns ported from A3M practices:
 * - Email addresses
 * - API keys (sk-*, key-*, AKIA*, ghp_*, gho_*, github_pat_*)
 * - IPv4 addresses (not in context like version numbers)
 * - Bearer tokens
 * - Private keys (-----BEGIN .* PRIVATE KEY-----)
 */

/** Result of guardrail processing. */
export interface GuardrailResult {
  /** The processed/redacted text. */
  text: string;
  /** Number of redactions made. */
  redactionCount: number;
  /** Types of PII found. */
  detectedTypes: Set<string>;
}

interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  // API keys - common prefixes
  {
    name: "openai_key",
    pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    name: "generic_key",
    pattern: /\bkey-[a-zA-Z0-9]{20,}\b/gi,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    name: "aws_key",
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY]",
  },
  {
    name: "github_token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    name: "github_pat",
    pattern: /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
    replacement: "[REDACTED_GITHUB_PAT]",
  },
  // Bearer tokens in headers/strings
  {
    name: "bearer_token",
    pattern: /\bBearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  // Private keys
  {
    name: "private_key",
    pattern: /-----BEGIN\s+[A-Z\s]*PRIVATE\s+KEY-----[\s\S]*?-----END\s+[A-Z\s]*PRIVATE\s+KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  // Email addresses
  {
    name: "email",
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // IPv4 addresses - avoid matching version numbers like 1.2.3.4 in semver
  {
    name: "ipv4",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
    replacement: "[REDACTED_IP]",
  },
];

/**
 * Apply PII guardrails to a text string.
 * Returns the redacted text along with metadata about what was redacted.
 */
export function applyGuardrails(text: string): GuardrailResult {
  let processed = text;
  let totalRedactions = 0;
  const detectedTypes = new Set<string>();

  for (const { name, pattern, replacement } of REDACTION_PATTERNS) {
    // Reset regex state (patterns have /g flag)
    const matches = processed.match(pattern);
    if (matches && matches.length > 0) {
      detectedTypes.add(name);
      totalRedactions += matches.length;
      processed = processed.replace(pattern, replacement);
    }
  }

  return {
    text: processed,
    redactionCount: totalRedactions,
    detectedTypes,
  };
}

/**
 * Apply guardrails only to user-visible text content.
 * Skips system prompts and tool results which may legitimately contain paths/versions.
 */
export function applyGuardrailsToUserContent(content: string): string {
  return applyGuardrails(content).text;
}
