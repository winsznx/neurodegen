import type { PublicClient, Transport, Chain } from 'viem';
import type { PreExecutionCheckResult, PositionState } from '@/types/execution';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PythHermesClient } from '@/lib/clients/pyth';
import type { RiskManager } from './riskManager';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';
import { PYTH_FEED_IDS } from '@/config/chains';
import {
  oracleDivergenceCheck,
  crowdScoreCheck,
  fundingRateCheck,
  slippageCheck,
  collateralCheck,
  riskManagerCheck,
  type CheckEntry,
} from './preExecutionChecks';

export class PreExecutionChecker {
  constructor(
    private publicClient: PublicClient<Transport, Chain>,
    private hotState: HotStateStore,
    private pythClient: PythHermesClient,
    private riskManager: RiskManager,
    private agentAddress: `0x${string}`
  ) {}

  async runChecks(
    pair: string,
    proposedCollateralUsd: number,
    leverageMultiplier: number,
    _regimeParameters: RegimeParameters,
    openPositions: PositionState[]
  ): Promise<PreExecutionCheckResult> {
    const proposedNotionalUsd = proposedCollateralUsd * leverageMultiplier;

    // fetch wallet balance once — reused by both collateralCheck and riskManagerCheck
    const walletBalanceUsd = await this.fetchWalletBalanceUsd();

    const checks: CheckEntry[] = await Promise.all([
      oracleDivergenceCheck(pair, this.hotState, this.pythClient),
      Promise.resolve(crowdScoreCheck(pair, this.hotState)),
      Promise.resolve(fundingRateCheck(pair, this.hotState)),
      Promise.resolve(slippageCheck(pair, proposedCollateralUsd, this.hotState)),
      Promise.resolve(collateralCheck(proposedCollateralUsd, walletBalanceUsd)),
      riskManagerCheck(proposedNotionalUsd, openPositions, walletBalanceUsd, this.riskManager),
    ]);

    return { passed: checks.every((c) => c.passed), checks };
  }

  private async fetchWalletBalanceUsd(): Promise<number> {
    try {
      const balance = await this.publicClient.getBalance({ address: this.agentAddress });
      const balanceBnb = Number(balance) / 1e18;
      const updates = await this.pythClient.getLatestPriceUpdate([PYTH_FEED_IDS.BNB_USD]);
      const update = updates[0];
      if (!update) return 0;
      const bnbPrice = Number(update.price) * Math.pow(10, update.exponent);
      return balanceBnb * bnbPrice;
    } catch {
      return 0;
    }
  }
}
