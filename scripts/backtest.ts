#!/usr/bin/env tsx
/**
 * Run the V2 backtestRunner against a small synthetic fixture.
 * Intended as a sanity check during demo prep; for real historical
 * replay, replace the fixture builder with a CMC-snapshot loader.
 *
 * Usage:
 *   pnpm tsx scripts/backtest.ts [--seed <s>] [--steps <n>]
 */

import { runBacktest, type BacktestStep } from '@/lib/services/backtestRunner';
import type {
  CMCFearGreedEvent,
  CMCQuoteEvent,
  PerceptionEvent,
} from '@/types/perception';

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function buildFixture(stepCount: number): BacktestStep[] {
  const out: BacktestStep[] = [];
  let cakePrice = 2.5;
  for (let i = 0; i < stepCount; i++) {
    const ts = i + 1;
    // Drift CAKE between 2.4 and 2.7 to keep PnL bounded.
    cakePrice = 2.5 + 0.2 * Math.sin(i / 4);
    const quote: CMCQuoteEvent = {
      eventId: `q-CAKE-${ts}`,
      source: 'cmc_hub',
      eventType: 'quote_update',
      timestamp: ts,
      tokenSymbol: 'CAKE',
      tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
      priceUSD: cakePrice,
      volume24hUSD: 12_345_678,
      percentChange1h: 1.5,
      percentChange24h: 3,
      marketCapUSD: 800_000_000,
      cmcRank: 70,
    };
    const fearGreed: CMCFearGreedEvent = {
      eventId: `fg-${ts}`,
      source: 'cmc_hub',
      eventType: 'fear_greed_update',
      timestamp: ts,
      value: 60,
      label: 'greed',
    };
    const events: PerceptionEvent[] = [quote, fearGreed];

    out.push({
      timestamp: ts,
      events,
      narrativeFixture: {
        narrativeSummary: 'CAKE trending in BNB ecosystem narratives',
        kolMentionedTokens: ['CAKE'],
        sentimentScore: 0.45,
        confidenceLevel: 0.7,
        direction: 'bullish',
        flaggedAnomalies: [],
        topThesisToken: 'CAKE',
      },
      quantFixture: {
        features: [
          { name: 'funding_rate', value: 0.04, direction: 'bullish', weight: 0.6 },
          { name: 'liquidity', value: 'adequate', direction: 'neutral', weight: 0.5 },
        ],
        dominantDirection: 'bullish',
        liquidityAdequate: true,
        fundingRateWarning: false,
        recommendedToken: 'CAKE',
      },
      riskFixture: {
        action: 'open_long',
        targetToken: 'CAKE',
        confidence: 0.65,
        rationale: 'narrative + quant aligned',
        dissentAcknowledged: false,
      },
      priceUSDBySymbol: { CAKE: cakePrice },
    });
  }
  return out;
}

async function main(): Promise<void> {
  const seed = arg('seed', 'demo');
  const stepCount = parseInt(arg('steps', '12'), 10);
  const steps = buildFixture(stepCount);
  const result = await runBacktest(steps, { seed });

  console.log(`fixture hash:   ${result.fixtureHash}`);
  console.log(`sessions ran:   ${result.sessions.length}`);
  console.log(`cumulative pnl: ${(result.cumulativePnLPct * 100).toFixed(2)}%`);
  console.log(`cumulative usd: $${result.cumulativePnLUSD.toFixed(2)}`);
  console.log(`---`);
  for (const trade of result.simulatedTrades) {
    console.log(
      `#${trade.sessionNumber.toString().padStart(3, '0')} ${trade.action.padEnd(12)} ${trade.tokenSymbol ?? '-'} entry=${trade.entryPriceUSD ?? '-'} exit=${trade.exitPriceUSD ?? '-'} pnl=${trade.pnlPct === null ? '-' : (trade.pnlPct * 100).toFixed(2) + '%'}`,
    );
  }
}

void main();
