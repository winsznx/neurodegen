import type { PublicClient, Transport, Chain } from 'viem';
import type { PreExecutionCheckResult, PositionState } from '@/types/execution';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PythHermesClient } from '@/lib/clients/pyth';
import type { RiskManager } from './riskManager';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';
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
    proposedSizeUsd: number,
    _regimeParameters: RegimeParameters,
    openPositions: PositionState[]
  ): Promise<PreExecutionCheckResult> {
    const checks: CheckEntry[] = [
      await oracleDivergenceCheck(pair, this.hotState, this.pythClient),
      crowdScoreCheck(pair, this.hotState),
      fundingRateCheck(pair, this.hotState),
      slippageCheck(pair, proposedSizeUsd, this.hotState),
      await collateralCheck(proposedSizeUsd, this.publicClient, this.agentAddress, this.pythClient),
      riskManagerCheck(proposedSizeUsd, openPositions, this.riskManager),
    ];

    return { passed: checks.every((c) => c.passed), checks };
  }
}
