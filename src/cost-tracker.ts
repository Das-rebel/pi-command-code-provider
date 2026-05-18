/**
 * Per-request cost tracking with daily/monthly budget enforcement.
 *
 * Records token usage and estimated cost per request. Before each request,
 * checks whether the configured daily or monthly budget has been exceeded.
 */

import type { BudgetConfig, CostRecord, CostSummary, BudgetCheck } from "./types.js";

const DEFAULT_BUDGET: BudgetConfig = {
  dailyLimitUsd: 50,
  monthlyLimitUsd: 1000,
};

export class CostTracker {
  private readonly records: CostRecord[] = [];
  private readonly config: BudgetConfig;

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  /**
   * Record a cost entry for a model invocation.
   */
  record(
    model: string,
    usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: { total: number } },
  ): void {
    this.records.push({
      model,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      costUsd: usage.cost.total,
      timestamp: Date.now(),
    });

    // Evict records older than 35 days to bound memory
    const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
    while (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }

  /**
   * Check whether a new request is allowed within budget.
   * Returns the most restrictive check (smallest remaining budget).
   */
  checkBudget(): BudgetCheck {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let dailySpend = 0;
    let monthlySpend = 0;

    for (const record of this.records) {
      if (record.timestamp >= dayStart) dailySpend += record.costUsd;
      if (record.timestamp >= monthStart) monthlySpend += record.costUsd;
    }

    const dailyRemaining = this.config.dailyLimitUsd - dailySpend;
    const monthlyRemaining = this.config.monthlyLimitUsd - monthlySpend;

    if (dailyRemaining <= 0) {
      return { allowed: false, remainingUsd: Math.max(0, dailyRemaining), period: "daily" };
    }

    if (monthlyRemaining <= 0) {
      return { allowed: false, remainingUsd: Math.max(0, monthlyRemaining), period: "monthly" };
    }

    // Return the more restrictive
    if (dailyRemaining <= monthlyRemaining) {
      return { allowed: true, remainingUsd: dailyRemaining, period: "daily" };
    }
    return { allowed: true, remainingUsd: monthlyRemaining, period: "monthly" };
  }

  /**
   * Get a cost summary broken down by model.
   */
  getSummary(): CostSummary {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let totalCost = 0;
    let dailySpend = 0;
    let monthlySpend = 0;
    const byModel: CostSummary["byModel"] = {};

    for (const record of this.records) {
      totalCost += record.costUsd;
      if (record.timestamp >= dayStart) dailySpend += record.costUsd;
      if (record.timestamp >= monthStart) monthlySpend += record.costUsd;

      if (!byModel[record.model]) {
        byModel[record.model] = { cost: 0, requests: 0, inputTokens: 0, outputTokens: 0 };
      }
      byModel[record.model].cost += record.costUsd;
      byModel[record.model].requests++;
      byModel[record.model].inputTokens += record.inputTokens;
      byModel[record.model].outputTokens += record.outputTokens;
    }

    return { totalCost, byModel, dailySpend, monthlySpend };
  }

  /** Get configured budget limits. */
  getBudgetLimits(): BudgetConfig {
    return { ...this.config };
  }
}
