import type { PositionState } from '@/types/execution';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PythHermesClient } from '@/lib/clients/pyth';
import type { RiskManager } from './riskManager';
import { getDailyRealizedLoss } from '@/lib/queries/positions';
import {
  ORACLE_DIVERGENCE_MAX,
  OI_IMBALANCE_MAX,
  FUNDING_RATE_MAX,
  MAX_SLIPPAGE,
  GAS_BUFFER_BNB,
} from '@/config/execution';
import { PYTH_FEED_IDS } from '@/config/chains';

export type CheckEntry = {
  name: string;
  passed: boolean;
  value: string | number;
  threshold: string | number;
  message: string;
};

const PAIR_FEED_MAP: Record<string, string> = {
  'BTC/USDT': PYTH_FEED_IDS.BTC_USD,
  'ETH/USDT': PYTH_FEED_IDS.ETH_USD,
  'BNB/USDT': PYTH_FEED_IDS.BNB_USD,
};

async function pythPrice(client: PythHermesClient, feedId: string): Promise<number> {
  const updates = await client.getLatestPriceUpdate([feedId]);
  const update = updates[0];
  if (!update) throw new Error(`Pyth price unavailable for ${feedId}`);
  return Number(update.price) * Math.pow(10, update.exponent);
}

export async function oracleDivergenceCheck(
  pair: string,
  hotState: HotStateStore,
  pyth: PythHermesClient
): Promise<CheckEntry> {
  const feedId = PAIR_FEED_MAP[pair];
  if (!feedId) {
    return { name: 'oracle_divergence', passed: false, value: 'N/A', threshold: ORACLE_DIVERGENCE_MAX, message: `no Pyth feed for ${pair}` };
  }
  try {
    const snapshots = hotState.getRecentEvents('myx');
    const snap = snapshots.find((e) => 'pair' in e && (e as { pair: string }).pair === pair);
    if (!snap || !('lastPrice' in snap) || !('indexPrice' in snap)) {
      return { name: 'oracle_divergence', passed: false, value: 'N/A', threshold: ORACLE_DIVERGENCE_MAX, message: 'no MYX snapshot yet' };
    }
    const myxPrice = (snap as { lastPrice: number }).lastPrice;
    const myxIndexPrice = (snap as { indexPrice: number }).indexPrice;
    let referencePrice = 0;
    let source: 'pyth' | 'myx_index' = 'pyth';

    try {
      referencePrice = await pythPrice(pyth, feedId);
    } catch {
      referencePrice = myxIndexPrice;
      source = 'myx_index';
    }

    if (!Number.isFinite(referencePrice) || referencePrice === 0) {
      return { name: 'oracle_divergence', passed: false, value: 'N/A', threshold: ORACLE_DIVERGENCE_MAX, message: 'Pyth price unavailable and MYX index price unavailable' };
    }
    const divergence = Math.abs(myxPrice - referencePrice) / referencePrice;
    const passed = divergence < ORACLE_DIVERGENCE_MAX;
    return {
      name: 'oracle_divergence',
      passed,
      value: divergence,
      threshold: ORACLE_DIVERGENCE_MAX,
      message: passed ? `ok (${source})` : `divergence ${(divergence * 100).toFixed(2)}% exceeds max (${source})`,
    };
  } catch (err) {
    return { name: 'oracle_divergence', passed: false, value: 'error', threshold: ORACLE_DIVERGENCE_MAX, message: err instanceof Error ? err.message : String(err) };
  }
}

export function crowdScoreCheck(pair: string, hotState: HotStateStore): CheckEntry {
  const metrics = hotState.getMetrics();
  const pm = metrics?.myxMetrics[pair];
  if (!pm) return { name: 'crowd_score', passed: true, value: 0, threshold: OI_IMBALANCE_MAX, message: 'no data, skipping' };
  const score = Math.abs(pm.crowdScore);
  const passed = score < OI_IMBALANCE_MAX;
  return { name: 'crowd_score', passed, value: score, threshold: OI_IMBALANCE_MAX, message: passed ? 'ok' : `crowd score ${score.toFixed(3)} exceeds max` };
}

export function fundingRateCheck(pair: string, hotState: HotStateStore): CheckEntry {
  const metrics = hotState.getMetrics();
  const pm = metrics?.myxMetrics[pair];
  if (!pm || pm.fundingRateCurrent === null) {
    return { name: 'funding_rate', passed: true, value: 0, threshold: FUNDING_RATE_MAX, message: 'funding unavailable' };
  }
  const rate = Math.abs(pm.fundingRateCurrent);
  const passed = rate < FUNDING_RATE_MAX;
  return { name: 'funding_rate', passed, value: rate, threshold: FUNDING_RATE_MAX, message: passed ? 'ok' : `funding rate ${rate} exceeds max` };
}

export function slippageCheck(pair: string, proposedSizeUsd: number, hotState: HotStateStore): CheckEntry {
  const snapshots = hotState.getRecentEvents('myx');
  const snap = snapshots.find((e) => 'pair' in e && (e as { pair: string }).pair === pair);
  if (!snap || !('openInterestUsd' in snap)) {
    return { name: 'slippage', passed: true, value: 0, threshold: MAX_SLIPPAGE, message: 'no OI data, skipping' };
  }
  const oiUsd = (snap as { openInterestUsd: number }).openInterestUsd;
  const quoteVolumeUsd = 'quoteVolume' in snap ? (snap as { quoteVolume: number }).quoteVolume : 0;
  const liquidityBasisUsd = Math.max(oiUsd, quoteVolumeUsd);
  if (liquidityBasisUsd <= 0) {
    return { name: 'slippage', passed: true, value: 0, threshold: MAX_SLIPPAGE, message: 'no liquidity basis, skipping' };
  }
  const estimated = proposedSizeUsd / liquidityBasisUsd;
  const passed = estimated <= MAX_SLIPPAGE;
  return {
    name: 'slippage',
    passed,
    value: estimated,
    threshold: MAX_SLIPPAGE,
    message: passed ? 'ok' : `estimated slippage ${(estimated * 100).toFixed(2)}% exceeds max`,
  };
}

export function collateralCheck(
  proposedSizeUsd: number,
  availableCollateralUsd: number
): CheckEntry {
  const passed = availableCollateralUsd >= proposedSizeUsd;
  return {
    name: 'collateral',
    passed,
    value: availableCollateralUsd,
    threshold: proposedSizeUsd,
    message: passed ? 'ok' : `USDT collateral $${availableCollateralUsd.toFixed(2)} below required $${proposedSizeUsd.toFixed(2)}`,
  };
}

export function gasBalanceCheck(gasBalanceBnb: number): CheckEntry {
  const passed = gasBalanceBnb >= GAS_BUFFER_BNB;
  return {
    name: 'gas_balance',
    passed,
    value: gasBalanceBnb,
    threshold: GAS_BUFFER_BNB,
    message: passed ? 'ok' : `BNB gas buffer ${gasBalanceBnb.toFixed(4)} below required ${GAS_BUFFER_BNB.toFixed(4)}`,
  };
}

export async function riskManagerCheck(
  proposedCollateralUsd: number,
  leverage: number,
  openPositions: PositionState[],
  walletCollateralUsd: number,
  riskManager: RiskManager
): Promise<CheckEntry> {
  const dailyLoss = await getDailyRealizedLoss().catch(() => 0);
  const result = riskManager.canOpenPosition(
    proposedCollateralUsd,
    leverage,
    openPositions,
    walletCollateralUsd,
    dailyLoss
  );
  return {
    name: 'risk_manager',
    passed: result.allowed,
    value: result.allowed ? 'approved' : 'rejected',
    threshold: 'all_checks',
    message: result.reason,
  };
}
