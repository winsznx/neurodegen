import type { AggregateMetrics } from '@/types/perception';
import type { RegimeLabel } from '@/types/cognition';

export interface RegimeParameters {
  positionSizeMultiplier: number;
  maxLeverage: number;
  tpPercentage: number;
  slPercentage: number;
  cooldownAfterLossMs: number;
}

const REGIME_PARAMS: Record<RegimeLabel, RegimeParameters> = {
  volatile: {
    positionSizeMultiplier: 0.3,
    maxLeverage: 3,
    tpPercentage: 0.02,
    slPercentage: 0.015,
    cooldownAfterLossMs: 3_600_000,
  },
  retail_frenzy: {
    positionSizeMultiplier: 1.5,
    maxLeverage: 15,
    tpPercentage: 0.08,
    slPercentage: 0.04,
    cooldownAfterLossMs: 600_000,
  },
  active: {
    positionSizeMultiplier: 1.0,
    maxLeverage: 10,
    tpPercentage: 0.05,
    slPercentage: 0.03,
    cooldownAfterLossMs: 900_000,
  },
  quiet: {
    positionSizeMultiplier: 0.5,
    maxLeverage: 5,
    tpPercentage: 0.03,
    slPercentage: 0.02,
    cooldownAfterLossMs: 1_800_000,
  },
};

type FundingDirection = 'rising' | 'falling' | 'stable';

export class RegimeClassifier {
  private previousFundingTrends = new Map<string, FundingDirection>();

  classify(metrics: AggregateMetrics): { regime: RegimeLabel; parameters: RegimeParameters } {
    if (this.isVolatile(metrics)) {
      this.updateTrends(metrics);
      return { regime: 'volatile', parameters: REGIME_PARAMS.volatile };
    }

    this.updateTrends(metrics);

    if (this.isRetailFrenzy(metrics)) {
      return { regime: 'retail_frenzy', parameters: REGIME_PARAMS.retail_frenzy };
    }

    if (this.isActive(metrics)) {
      return { regime: 'active', parameters: REGIME_PARAMS.active };
    }

    return { regime: 'quiet', parameters: REGIME_PARAMS.quiet };
  }

  private isVolatile(metrics: AggregateMetrics): boolean {
    for (const [pair, data] of Object.entries(metrics.myxMetrics)) {
      const previousTrend = this.previousFundingTrends.get(pair);
      const currentTrend = data.fundingTrendDirection;
      const trendFlipped =
        previousTrend !== undefined &&
        previousTrend !== 'stable' &&
        currentTrend !== 'stable' &&
        previousTrend !== currentTrend;

      if (trendFlipped && Math.abs(data.crowdScore) > 0.3) {
        return true;
      }
    }
    return false;
  }

  private isRetailFrenzy(metrics: AggregateMetrics): boolean {
    return (
      metrics.launchVelocityPerHour > 20 ||
      metrics.capitalInflowBNBPerHour > 10 ||
      metrics.graduationVelocityPerHour > 2
    );
  }

  private isActive(metrics: AggregateMetrics): boolean {
    return (
      metrics.launchVelocityPerHour >= 5 &&
      metrics.launchVelocityPerHour <= 20 &&
      metrics.capitalInflowBNBPerHour >= 2 &&
      metrics.capitalInflowBNBPerHour <= 10
    );
  }

  private updateTrends(metrics: AggregateMetrics): void {
    for (const [pair, data] of Object.entries(metrics.myxMetrics)) {
      this.previousFundingTrends.set(pair, data.fundingTrendDirection);
    }
  }
}

export const regimeClassifier = new RegimeClassifier();
