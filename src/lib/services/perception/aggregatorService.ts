import {
  LAUNCH_VELOCITY_WINDOW_HOURS,
  CAPITAL_INFLOW_WINDOW_HOURS,
  GRADUATION_VELOCITY_WINDOW_HOURS,
  FUNDING_TREND_SNAPSHOTS,
} from '@/config/perception';
import { MAX_HEALTHY_FUNDING_RATE } from '@/config/chains';
import type {
  PerceptionEvent,
  MarketSnapshot,
  LaunchEvent,
  PurchaseEvent,
  GraduationEvent,
  AggregateMetrics,
} from '@/types/perception';

const WEI_PER_BNB = 10n ** 18n;

function deriveCrowdScore(fundingRate: number | null): number {
  if (fundingRate === null) return 0;
  const raw = fundingRate / MAX_HEALTHY_FUNDING_RATE;
  return Math.max(-1, Math.min(1, raw));
}

export class AggregatorService {
  private snapshotHistory = new Map<string, MarketSnapshot[]>();

  computeMetrics(
    events: PerceptionEvent[],
    currentSnapshots: MarketSnapshot[]
  ): AggregateMetrics {
    const now = Date.now();

    for (const snapshot of currentSnapshots) {
      const history = this.snapshotHistory.get(snapshot.pair) ?? [];
      history.push(snapshot);
      if (history.length > FUNDING_TREND_SNAPSHOTS) {
        history.splice(0, history.length - FUNDING_TREND_SNAPSHOTS);
      }
      this.snapshotHistory.set(snapshot.pair, history);
    }

    const launchWindow = now - LAUNCH_VELOCITY_WINDOW_HOURS * 3600_000;
    const capitalWindow = now - CAPITAL_INFLOW_WINDOW_HOURS * 3600_000;
    const gradWindow = now - GRADUATION_VELOCITY_WINDOW_HOURS * 3600_000;

    const launches = events.filter(
      (e): e is LaunchEvent => e.source === 'fourmeme' && e.eventType === 'token_create' && e.timestamp >= launchWindow
    );
    const purchases = events.filter(
      (e): e is PurchaseEvent => e.source === 'fourmeme' && e.eventType === 'token_purchase' && e.timestamp >= capitalWindow
    );
    const graduations = events.filter(
      (e): e is GraduationEvent => e.source === 'fourmeme' && e.eventType === 'liquidity_added' && e.timestamp >= gradWindow
    );

    const launchVelocityPerHour = launches.length / LAUNCH_VELOCITY_WINDOW_HOURS;

    let totalBnbWei = 0n;
    for (const p of purchases) totalBnbWei += p.bnbAmount;
    const totalBnb = Number(totalBnbWei) / Number(WEI_PER_BNB);
    const capitalInflowBNBPerHour = totalBnb / CAPITAL_INFLOW_WINDOW_HOURS;

    const graduationVelocityPerHour = graduations.length / GRADUATION_VELOCITY_WINDOW_HOURS;

    const graduatedTokens = new Set(graduations.map((g) => g.tokenAddress));
    const activeTokens = new Set<string>();
    for (const l of launches) {
      if (!graduatedTokens.has(l.tokenAddress)) {
        const hasPurchase = purchases.some((p) => p.tokenAddress === l.tokenAddress);
        if (hasPurchase) activeTokens.add(l.tokenAddress);
      }
    }

    const inflowByToken = new Map<string, { bnbInflow: bigint; lastBalance: bigint }>();
    for (const p of purchases) {
      const existing = inflowByToken.get(p.tokenAddress) ?? { bnbInflow: 0n, lastBalance: 0n };
      existing.bnbInflow += p.bnbAmount;
      existing.lastBalance = p.currentCurveBalance;
      inflowByToken.set(p.tokenAddress, existing);
    }

    const topTokensByInflow = [...inflowByToken.entries()]
      .sort((a, b) => (b[1].bnbInflow > a[1].bnbInflow ? 1 : -1))
      .slice(0, 5)
      .map(([tokenAddress, data]) => {
        const balance = Number(data.lastBalance) / 1e18;
        const curveProgress = balance > 200_000_000
          ? 100 - (((balance - 200_000_000) * 100) / 800_000_000)
          : 100;
        return { tokenAddress, bnbInflow: data.bnbInflow, curveProgress };
      });

    const myxMetrics: AggregateMetrics['myxMetrics'] = {};
    for (const snapshot of currentSnapshots) {
      const history = this.snapshotHistory.get(snapshot.pair) ?? [];
      const fundingTrendDirection = this.computeFundingTrend(history);
      const crowdScore = deriveCrowdScore(snapshot.fundingRate);

      myxMetrics[snapshot.pair] = {
        crowdScore,
        fundingRateCurrent: snapshot.fundingRate,
        fundingTrendDirection,
        openInterestUsd: snapshot.openInterestUsd,
      };
    }

    return {
      computedAt: now,
      launchVelocityPerHour,
      capitalInflowBNBPerHour,
      graduationVelocityPerHour,
      activeLaunches: activeTokens.size,
      topTokensByInflow,
      myxMetrics,
    };
  }

  private computeFundingTrend(
    snapshots: MarketSnapshot[]
  ): 'rising' | 'falling' | 'stable' {
    if (snapshots.length < 2) return 'stable';
    let rising = 0;
    let falling = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1].fundingRate;
      const curr = snapshots[i].fundingRate;
      if (prev === null || curr === null) continue;
      if (curr > prev) rising++;
      else if (curr < prev) falling++;
    }
    const threshold = Math.floor(snapshots.length / 2);
    if (rising > threshold) return 'rising';
    if (falling > threshold) return 'falling';
    return 'stable';
  }
}

export const aggregator = new AggregatorService();
