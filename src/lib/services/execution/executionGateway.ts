import type { MyxClient } from '@myx-trade/sdk';
import { keccak256, stringToBytes } from 'viem';
import type { ActionRecommendation, RegimeLabel } from '@/types/cognition';
import type { PositionState } from '@/types/execution';
import type { RegimeParameters } from '@/lib/services/cognition/regimeClassifier';
import type { ReasoningCommitment } from '@/lib/utils/reasoningHash';
import type { PreExecutionChecker } from './preExecutionChecker';
import type { TransactionSubmitter } from './transactionSubmitter';
import type { PositionTracker } from './positionTracker';
import type { AttestationEmitter } from './attestationEmitter';
import { buildIncreaseOrderParams, buildDecreaseOrderParams } from './myxOrderBuilder';
import { resolveOrderContext } from './orderContext';
import { mirrorDispatcher } from '@/lib/services/monetization/mirrorDispatcher';
import { getSinglePrice } from '@/lib/clients/myxSdk';
import { getOpenPositions, updatePositionStatus } from '@/lib/queries/positions';
import { toCollateralScale } from '@/lib/utils/decimalScaling';
import { BSC_CHAIN_ID } from '@/config/chains';

interface ExecutionResult {
  executed: boolean;
  orderId: string | null;
  txHash: string | null;
  failureReason: string | null;
  dryRun?: boolean;
}

export class ExecutionGateway {
  constructor(
    private sdk: MyxClient,
    private preChecker: PreExecutionChecker,
    private submitter: TransactionSubmitter,
    private tracker: PositionTracker,
    private attestation: AttestationEmitter,
    private agentAddress: `0x${string}`
  ) {}

  async executeAction(
    recommendation: ActionRecommendation,
    regimeParameters: RegimeParameters,
    reasoningGraphId: string,
    commitment: ReasoningCommitment
  ): Promise<ExecutionResult> {
    if (recommendation.action === 'hold' || recommendation.action === 'adjust_parameters') {
      return { executed: false, orderId: null, txHash: null, failureReason: null };
    }

    if (recommendation.action === 'close_position') {
      return { executed: false, orderId: null, txHash: null, failureReason: null };
    }

    try {
      const openPositions = await getOpenPositions();
      const checks = await this.preChecker.runChecks(
        recommendation.pair,
        recommendation.positionSizeUSD ?? 0,
        regimeParameters,
        openPositions
      );
      if (!checks.passed) {
        const failed = checks.checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.message}`);
        return { executed: false, orderId: null, txHash: null, failureReason: failed.join('; ') };
      }

      const positionId = crypto.randomUUID();
      const context = await resolveOrderContext(recommendation.pair, this.agentAddress, positionId);
      const indexPrice = await getSinglePrice(context.poolId);

      const placeParams = buildIncreaseOrderParams(
        recommendation,
        regimeParameters,
        indexPrice,
        context
      );

      const networkFee = await this.sdk.utils.getNetworkFee(context.marketId, BSC_CHAIN_ID);
      const feeAmount = typeof networkFee === 'string' ? networkFee : String(networkFee?.volScale ?? '0');

      const commitTx = await this.attestation.commitReasoning(
        commitment.reasoningHash,
        commitment.actionIntent
      );
      if (!commitTx) {
        console.warn('[execution-gateway] commit-reveal: commit tx not emitted, proceeding without on-chain commit');
      }

      const submit = await this.submitter.submitIncreaseOrder(placeParams, feeAmount);

      const positionState: PositionState = {
        positionId,
        pair: recommendation.pair,
        pairIndex: context.contractIndex,
        isLong: recommendation.action === 'open_long',
        entryPrice: indexPrice,
        exitPrice: null,
        collateralUsd: recommendation.positionSizeUSD ?? 0,
        sizeAmount: (recommendation.positionSizeUSD ?? 0) * (recommendation.leverageMultiplier ?? 1) / indexPrice,
        leverage: recommendation.leverageMultiplier ?? regimeParameters.maxLeverage,
        tpPrice: parseFloat(placeParams.tpPrice ?? '0') || null,
        slPrice: parseFloat(placeParams.slPrice ?? '0') || null,
        status: submit.dryRun ? 'submitted' : 'pending',
        orderId: submit.orderId,
        entryTxHash: submit.txHash,
        exitTxHash: null,
        exitReason: null,
        realizedPnlUsd: null,
        reasoningGraphId,
        openedAt: new Date().toISOString(),
        closedAt: null,
      };

      if (!submit.dryRun) {
        await this.tracker.trackNewOrder(positionState);
        void this.attestation.attestPositionOpen(
          reasoningGraphId,
          context.contractIndex,
          positionState.isLong,
          toCollateralScale(positionState.sizeAmount)
        );
        const orderIdBytes = keccak256(stringToBytes(submit.orderId ?? positionId));
        void this.attestation.revealExecution(
          commitment.reasoningHash,
          submit.txHash as `0x${string}`,
          orderIdBytes
        );
      }

      void mirrorDispatcher.onAgentEntry(positionState, recommendation).catch((err) =>
        console.error('[execution-gateway] mirror onAgentEntry failed:', err instanceof Error ? err.message : String(err))
      );

      return {
        executed: true,
        orderId: submit.orderId,
        txHash: submit.txHash,
        failureReason: null,
        dryRun: submit.dryRun,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[execution-gateway] error:', msg);
      return { executed: false, orderId: null, txHash: null, failureReason: msg };
    }
  }

  async closeSinglePosition(
    position: PositionState,
    reason: 'manual' | 'admin' = 'manual'
  ): Promise<{ closed: boolean; txHash: string | null; error: string | null }> {
    try {
      const context = await resolveOrderContext(position.pair, this.agentAddress, position.positionId);
      const params = buildDecreaseOrderParams(position, context);
      const submit = await this.submitter.submitDecreaseOrder(params);

      await updatePositionStatus(position.positionId, {
        status: 'closed',
        exitTxHash: submit.txHash,
        exitReason: reason,
        closedAt: new Date().toISOString(),
      });

      void this.attestation.attestPositionClose(
        position.reasoningGraphId,
        context.contractIndex,
        position.isLong,
        toCollateralScale(position.realizedPnlUsd ?? 0)
      );

      void mirrorDispatcher.onAgentExit({ ...position, exitReason: reason }).catch((err) =>
        console.error('[execution-gateway] mirror onAgentExit failed:', err instanceof Error ? err.message : String(err))
      );

      return { closed: true, txHash: submit.txHash, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[execution-gateway] closeSinglePosition ${position.positionId} failed:`, msg);
      return { closed: false, txHash: null, error: msg };
    }
  }

  async checkAndClosePositions(
    currentRegime: RegimeLabel,
    previousRegime: RegimeLabel | null
  ): Promise<void> {
    const openPositions = await getOpenPositions();
    const exits = await this.tracker.checkPositionExits(openPositions, currentRegime, previousRegime);

    for (const { position, reason } of exits) {
      try {
        const context = await resolveOrderContext(position.pair, this.agentAddress, position.positionId);
        const params = buildDecreaseOrderParams(position, context);
        const submit = await this.submitter.submitDecreaseOrder(params);

        await updatePositionStatus(position.positionId, {
          status: 'closed',
          exitTxHash: submit.txHash,
          exitReason: reason,
          closedAt: new Date().toISOString(),
        });

        void this.attestation.attestPositionClose(
          position.reasoningGraphId,
          context.contractIndex,
          position.isLong,
          toCollateralScale(position.realizedPnlUsd ?? 0)
        );

        void mirrorDispatcher.onAgentExit({ ...position, exitReason: reason }).catch((err) =>
          console.error('[execution-gateway] mirror onAgentExit failed:', err instanceof Error ? err.message : String(err))
        );
      } catch (err) {
        console.error(`[execution-gateway] failed to close ${position.positionId}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  stop(): void {
    this.tracker.stop();
  }
}
