/**
 * Per-day LLM token spend tracker with hard kill at configurable ceiling.
 * Direct fix for NEURODEGEN_V1_AUDIT.md §3.4.10 ("Hard kill switch on daily
 * LLM spend"). V1's invisible-exhaustion failure mode (DGrid quota silently
 * drained, agent kept ticking, dashboard kept showing 'running') is the worst
 * class of production failure. V2 visibly trips a hard kill so the agent
 * stops asking the model anything once the budget is gone.
 *
 * The ceiling is per-CYCLE-USD ($5/day default) but we track in input +
 * output tokens against canonical retail rates. Numbers are estimates; the
 * point is to fail closed rather than burn unbounded credit.
 */

interface RateCard {
  inputPerMillion: number;
  outputPerMillion: number;
}

const RATES: Record<string, RateCard> = {
  // Anthropic
  'claude-sonnet-4.6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4.5': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'anthropic/claude-sonnet-4.6': { inputPerMillion: 3, outputPerMillion: 15 },
  'anthropic/claude-haiku-4.5': { inputPerMillion: 0.8, outputPerMillion: 4 },
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'openai/gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'openai/gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  // DeepSeek / Qwen via DGrid
  'deepseek/deepseek-v3.2': { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  'qwen/qwen-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
};

const FALLBACK_RATE: RateCard = { inputPerMillion: 2.5, outputPerMillion: 10 };

const DAILY_LIMIT_USD = parseFloat(process.env.DAILY_LLM_SPEND_LIMIT_USD ?? '5');

function rateFor(modelId: string): RateCard {
  return RATES[modelId] ?? FALLBACK_RATE;
}

function utcDayBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

class LLMSpendTracker {
  private dayBucket = utcDayBucket();
  private dailyUSD = 0;
  private callCount = 0;
  private killActiveUntil: string | null = null;

  recordCall(modelId: string, inputTokens: number, outputTokens: number): void {
    this.rollOverIfNewDay();
    const rate = rateFor(modelId);
    const cost = (inputTokens / 1_000_000) * rate.inputPerMillion + (outputTokens / 1_000_000) * rate.outputPerMillion;
    this.dailyUSD += cost;
    this.callCount += 1;
    if (this.dailyUSD >= DAILY_LIMIT_USD) {
      this.killActiveUntil = this.dayBucket;
      console.warn(
        `[llm-spend] HARD KILL — daily $${this.dailyUSD.toFixed(4)} ≥ $${DAILY_LIMIT_USD.toFixed(2)} ceiling (calls=${this.callCount})`,
      );
    }
  }

  isKilled(): boolean {
    this.rollOverIfNewDay();
    return this.killActiveUntil === this.dayBucket;
  }

  ensureBudget(): void {
    if (this.isKilled()) {
      throw new Error(
        `LLM_DAILY_SPEND_LIMIT_HIT: $${this.dailyUSD.toFixed(4)} of $${DAILY_LIMIT_USD.toFixed(2)} spent today; agent gated to hold until ${this.dayBucket} ends`,
      );
    }
  }

  status(): {
    dayBucket: string;
    dailyUSD: number;
    ceilingUSD: number;
    killed: boolean;
    callCount: number;
  } {
    this.rollOverIfNewDay();
    return {
      dayBucket: this.dayBucket,
      dailyUSD: this.dailyUSD,
      ceilingUSD: DAILY_LIMIT_USD,
      killed: this.isKilled(),
      callCount: this.callCount,
    };
  }

  reset(): void {
    this.dayBucket = utcDayBucket();
    this.dailyUSD = 0;
    this.callCount = 0;
    this.killActiveUntil = null;
  }

  private rollOverIfNewDay(): void {
    const today = utcDayBucket();
    if (today !== this.dayBucket) {
      this.dayBucket = today;
      this.dailyUSD = 0;
      this.callCount = 0;
      this.killActiveUntil = null;
    }
  }
}

export const llmSpendTracker = new LLMSpendTracker();
