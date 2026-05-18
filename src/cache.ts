/**
 * Semantic cache for the Command Code provider.
 *
 * Ported from ~/tmlpd-skill/src/cache/semanticCache.ts
 * Uses character trigram Jaccard similarity for zero-dependency
 * semantic matching. No external embedding API needed.
 *
 * Default config: maxSize=500, similarityThreshold=0.95, ttl=30min
 */

import type { CacheConfig, CachedResponse, CacheEntry } from "./types.js";

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 500,
  similarityThreshold: 0.95,
  ttlMs: 30 * 60 * 1000, // 30 minutes
};

// ---------------------------------------------------------------------------
// N-gram utilities
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractTrigrams(text: string): Set<string> {
  const normalized = " " + normalize(text) + " ";
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3));
  }
  return trigrams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Semantic Cache
// ---------------------------------------------------------------------------

export interface SemanticCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

export class SemanticCache {
  private entries: CacheEntry[] = [];
  private readonly config: CacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Look up a cached response for a semantically similar query.
   * Returns the best match above the similarity threshold, or null.
   */
  get(query: string): CachedResponse | null {
    const now = Date.now();
    const queryTrigrams = extractTrigrams(query);

    let bestEntry: CacheEntry | null = null;
    let bestScore = 0;

    for (const entry of this.entries) {
      // Skip expired
      if (now > entry.timestamp + this.config.ttlMs) continue;

      const score = jaccard(queryTrigrams, entry.trigrams);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (bestEntry && bestScore >= this.config.similarityThreshold) {
      this.hits++;
      bestEntry.accessCount++;
      return {
        content: bestEntry.content,
        timestamp: bestEntry.timestamp,
        metadata: bestEntry.metadata,
      };
    }

    this.misses++;
    return null;
  }

  /**
   * Store a query->response pair in the cache.
   */
  set(query: string, response: string, metadata?: Record<string, unknown>): void {
    const now = Date.now();

    // Evict expired entries first
    this.evictExpired();

    // Evict oldest if at capacity
    if (this.entries.length >= this.config.maxSize) {
      this.evictOldest();
    }

    // Check if an exact-match entry already exists and update it
    const normalized = normalize(query);
    const existing = this.entries.find(
      (e) => normalize(e.key) === normalized && now <= e.timestamp + this.config.ttlMs,
    );
    if (existing) {
      existing.content = response;
      existing.metadata = metadata;
      existing.timestamp = now;
      existing.trigrams = extractTrigrams(query);
      return;
    }

    const entry: CacheEntry = {
      key: query,
      content: response,
      timestamp: now,
      metadata,
      trigrams: extractTrigrams(query),
      accessCount: 0,
    };
    this.entries.push(entry);
  }

  /** Clear all entries. */
  clear(): void {
    this.entries = [];
  }

  /** Get cache statistics. */
  getStats(): SemanticCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.entries.length,
    };
  }

  private evictExpired(): void {
    const now = Date.now();
    this.entries = this.entries.filter((e) => now <= e.timestamp + this.config.ttlMs);
  }

  private evictOldest(): void {
    if (this.entries.length === 0) return;
    let oldestIdx = 0;
    let oldestTime = Infinity;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].timestamp < oldestTime) {
        oldestTime = this.entries[i].timestamp;
        oldestIdx = i;
      }
    }
    this.entries.splice(oldestIdx, 1);
  }
}
