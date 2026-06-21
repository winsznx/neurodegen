import type { ActionRecommendation, ExecutionResultRecord } from '@/types/cognition';
import type {
  PositionState,
  RiskManagerState,
  TWAKPortfolioSnapshot,
} from '@/types/execution';
import { twakClient } from '@/lib/clients/twakClient';
import { tokenAddressBySymbol } from '@/lib/utils/allowedTokens';
import { MAX_SLIPPAGE_PCT } from '@/config/execution';
import { DRY_RUN_MODE, ENABLE_EXECUTION } from '@/config/features';
import { attestationEmitter } from './attestationEmitter';
import { PreExecutionChecker } from './preExecutionChecker';
import { riskManager } from './riskManager';
import { pythHermesClient } from '@/lib/clients/pyth';
import { insertPosition, updatePositionStatus } from '@/lib/queries/positions';

export interface TwakExecutorInputs {
  sessionId: string;
  reasoningHash: `0x${string}`;
  recommendation: ActionRecommendation;
  state: RiskManagerState;
  openPositions: PositionState[];
  portfolio: TWAKPortfolioSnapshot;
  agentAddress: `0x${string}`;
  cmcPriceUSD: number | null;
  pythSymbol: 'BTC_USD' | 'ETH_USD' | 'BNB_USD' | null;
  liquidityAdequate: boolean;
  fundingRateWarning: boolean;
  securityRiskScore: number | null;
  isHoneypot: boolean | null;
  tokenMomentum: { pct1h: number | null; pct24h: number | null } | null;
}

export interface TwakExecutorResult {
  executionResult: ExecutionResultRecord;
  attestationCommitTx: `0x${string}` | null;
  position: PositionState | null;
}

export class TwakExecutor {
  constructor(
    private readonly preChecker = new PreExecutionChecker({
      twak: twakClient,
      pyth: pythHermesClient,
      risk: riskManager,
    }),
  ) {}

  async execute(inputs: TwakExecutorInputs): Promise<TwakExecutorResult> {
    const checks = await this.preChecker.runChecks({
      recommendation: inputs.recommendation,
      state: inputs.state,
      openPositions: inputs.openPositions,
      cmcPriceUSD: inputs.cmcPriceUSD,
      pythSymbol: inputs.pythSymbol,
      liquidityAdequate: inputs.liquidityAdequate,
      fundingRateWarning: inputs.fundingRateWarning,
      securityRiskScore: inputs.securityRiskScore,
      isHoneypot: inputs.isHoneypot,
      portfolio: inputs.portfolio,
      agentAddress: inputs.agentAddress,
      tokenMomentum: inputs.tokenMomentum,
    });

    if (!checks.passed) {
      const failed = checks.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.message}`);
      return {
        executionResult: {
          executed: false,
          twakTxHash: null,
          bscscanUrl: null,
          attestationRevealTx: null,
          failureReason: failed.join('; '),
        },
        attestationCommitTx: null,
        position: null,
      };
    }

    if (inputs.recommendation.action === 'close_position') {
      return this.executeClose(inputs);
    }

    return this.executeOpen(inputs, checks.adjustedPositionSizeUSD);
  }

  private async executeOpen(
    inputs: TwakExecutorInputs,
    adjustedSizeUSD: number,
  ): Promise<TwakExecutorResult> {
    const targetSymbol = inputs.recommendation.tokenSymbol;
    if (!targetSymbol) {
      return failure('targetSymbol missing on open_long');
    }
    if (!ENABLE_EXECUTION) {
      return failure('ENABLE_EXECUTION=false');
    }
    const tokenAddress =
      tokenAddressBySymbol()[targetSymbol.toUpperCase()] ?? inputs.recommendation.tokenAddress;
    if (!tokenAddress) {
      return failure(`no on-chain address for ${targetSymbol}`);
    }

    const cmcPrice = inputs.cmcPriceUSD ?? 0;
    if (cmcPrice <= 0) {
      return failure('cmcPriceUSD ≤ 0; refusing to size in tokens');
    }
    const amountTokens = (adjustedSizeUSD / cmcPrice).toFixed(8);

    let attestationCommitTx: `0x${string}` | null = null;
    try {
      attestationCommitTx = await attestationEmitter.commitReasoning(
        inputs.reasoningHash,
        `${inputs.recommendation.action}:${targetSymbol}`,
      );
    } catch (err) {
      console.error('[twakExecutor] commit failed:', err instanceof Error ? err.message : String(err));
    }

    let swap;
    try {
      swap = await twakClient.executeSwap({
        fromTokenSymbol: 'USDT',
        toTokenSymbol: targetSymbol,
        amountTokens,
        slippagePct: MAX_SLIPPAGE_PCT * 100,
      });
    } catch (err) {
      return failureWithCommit(
        attestationCommitTx,
        `twak swap failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let attestationRevealTx: `0x${string}` | null = null;
    try {
      attestationRevealTx = await attestationEmitter.revealExecution(
        inputs.reasoningHash,
        swap.txHash,
      );
    } catch (err) {
      console.error('[twakExecutor] reveal failed:', err instanceof Error ? err.message : String(err));
    }

    const position: PositionState = {
      positionId: crypto.randomUUID(),
      sessionId: inputs.sessionId,
      tokenSymbol: targetSymbol,
      tokenAddress,
      direction: 'spot',
      sizeUSD: adjustedSizeUSD,
      leverage: 1,
      entryPriceUSD: cmcPrice,
      tpPriceUSD: inputs.recommendation.tpPercentage
        ? cmcPrice * (1 + inputs.recommendation.tpPercentage)
        : null,
      slPriceUSD: inputs.recommendation.slPercentage
        ? cmcPrice * (1 - inputs.recommendation.slPercentage)
        : null,
      twakTxHash: swap.txHash,
      attestationCommitTx,
      attestationRevealTx,
      status: 'SUBMITTED',
      exitPriceUSD: null,
      pnlUSD: null,
      pnlPct: null,
      exitReason: null,
      openedAt: new Date().toISOString(),
      closedAt: null,
    };

    try {
      await insertPosition(position);
    } catch (err) {
      console.error('[twakExecutor] insertPosition failed:', err instanceof Error ? err.message : String(err));
    }

    return {
      executionResult: {
        executed: true,
        twakTxHash: swap.txHash,
        bscscanUrl: swap.explorer,
        attestationRevealTx,
        failureReason: null,
        dryRun: DRY_RUN_MODE,
      },
      attestationCommitTx,
      position,
    };
  }

  private async executeClose(inputs: TwakExecutorInputs): Promise<TwakExecutorResult> {
    const target = inputs.openPositions[0];
    if (!target) return failure('close requested with no open positions');
    if (!ENABLE_EXECUTION) return failure('ENABLE_EXECUTION=false');

    const cmcPrice = inputs.cmcPriceUSD ?? target.entryPriceUSD;
    const amountTokens = (target.sizeUSD / cmcPrice).toFixed(8);

    let attestationCommitTx: `0x${string}` | null = null;
    try {
      attestationCommitTx = await attestationEmitter.commitReasoning(
        inputs.reasoningHash,
        `close_position:${target.tokenSymbol}`,
      );
    } catch (err) {
      console.error('[twakExecutor] commit failed:', err instanceof Error ? err.message : String(err));
    }

    let swap;
    try {
      swap = await twakClient.executeSwap({
        fromTokenSymbol: target.tokenSymbol,
        toTokenSymbol: 'USDT',
        amountTokens,
        slippagePct: MAX_SLIPPAGE_PCT * 100,
      });
    } catch (err) {
      return failureWithCommit(
        attestationCommitTx,
        `twak swap (close) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let attestationRevealTx: `0x${string}` | null = null;
    try {
      attestationRevealTx = await attestationEmitter.revealExecution(
        inputs.reasoningHash,
        swap.txHash,
      );
    } catch (err) {
      console.error('[twakExecutor] reveal failed:', err instanceof Error ? err.message : String(err));
    }

    const pnlUSD = (cmcPrice - target.entryPriceUSD) * (target.sizeUSD / target.entryPriceUSD);
    const pnlPct = target.entryPriceUSD > 0 ? (cmcPrice - target.entryPriceUSD) / target.entryPriceUSD : 0;

    try {
      await updatePositionStatus(target.positionId, {
        status: 'CLOSED',
        exitPriceUSD: cmcPrice,
        pnlUSD,
        pnlPct,
        exitReason: 'signal_exit',
        closedAt: new Date().toISOString(),
        attestationRevealTx,
      });
    } catch (err) {
      console.error('[twakExecutor] updatePositionStatus failed:', err instanceof Error ? err.message : String(err));
    }

    return {
      executionResult: {
        executed: true,
        twakTxHash: swap.txHash,
        bscscanUrl: swap.explorer,
        attestationRevealTx,
        failureReason: null,
        dryRun: DRY_RUN_MODE,
      },
      attestationCommitTx,
      position: { ...target, status: 'CLOSED', exitPriceUSD: cmcPrice, pnlUSD, pnlPct, exitReason: 'signal_exit', closedAt: new Date().toISOString() },
    };
  }
}

function failure(reason: string): TwakExecutorResult {
  return {
    executionResult: { executed: false, twakTxHash: null, bscscanUrl: null, attestationRevealTx: null, failureReason: reason },
    attestationCommitTx: null,
    position: null,
  };
}

function failureWithCommit(
  attestationCommitTx: `0x${string}` | null,
  reason: string,
): TwakExecutorResult {
  return {
    executionResult: { executed: false, twakTxHash: null, bscscanUrl: null, attestationRevealTx: null, failureReason: reason },
    attestationCommitTx,
    position: null,
  };
}
