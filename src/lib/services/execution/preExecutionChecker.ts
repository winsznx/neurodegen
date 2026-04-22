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
  gasBalanceCheck,
  riskManagerCheck,
  type CheckEntry,
} from './preExecutionChecks';

interface WalletFundsSnapshot {
  bnbBalance: number;
  bnbUsdValue: number;
  usdtCollateralUsd: number;
  totalUsd: number;
}

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
    const walletFunds = await this.fetchWalletFunds();
    const effectiveCollateralUsd = this.riskManager.resolveExecutableCollateralUsd(
      proposedCollateralUsd,
      openPositions,
      walletFunds.usdtCollateralUsd
    );

    const checks: CheckEntry[] = await Promise.all([
      oracleDivergenceCheck(pair, this.hotState, this.pythClient),
      Promise.resolve(crowdScoreCheck(pair, this.hotState)),
      Promise.resolve(fundingRateCheck(pair, this.hotState)),
      Promise.resolve(slippageCheck(pair, effectiveCollateralUsd, this.hotState)),
      Promise.resolve(collateralCheck(effectiveCollateralUsd, walletFunds.usdtCollateralUsd)),
      Promise.resolve(gasBalanceCheck(walletFunds.bnbBalance)),
      riskManagerCheck(
        effectiveCollateralUsd,
        leverageMultiplier,
        openPositions,
        walletFunds.usdtCollateralUsd,
        this.riskManager
      ),
    ]);

    if (effectiveCollateralUsd > 0 && effectiveCollateralUsd < proposedCollateralUsd) {
      checks.unshift({
        name: 'position_sizing',
        passed: true,
        value: effectiveCollateralUsd,
        threshold: proposedCollateralUsd,
        message: `requested $${proposedCollateralUsd.toFixed(2)} resized to $${effectiveCollateralUsd.toFixed(2)} based on wallet headroom`,
      });
    }

    if (effectiveCollateralUsd <= 0) {
      checks.unshift({
        name: 'position_sizing',
        passed: false,
        value: effectiveCollateralUsd,
        threshold: proposedCollateralUsd,
        message: 'available collateral headroom is below the minimum executable position size',
      });
    }

    return {
      passed: effectiveCollateralUsd > 0 && checks.every((c) => c.passed),
      effectiveCollateralUsd,
      checks,
    };
  }

  private async fetchWalletFunds(): Promise<WalletFundsSnapshot> {
    try {
      const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as const;
      const ERC20_BALANCE_ABI = [
        { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
      ] as const;

      const [bnbRaw, usdtRaw] = await Promise.all([
        this.publicClient.getBalance({ address: this.agentAddress }),
        this.publicClient.readContract({ address: USDT_ADDRESS, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [this.agentAddress] }).catch(() => 0n),
      ]);

      const usdtBalance = Number(usdtRaw) / 1e18;

      const updates = await this.pythClient.getLatestPriceUpdate([PYTH_FEED_IDS.BNB_USD]);
      const update = updates[0];
      const bnbPrice = update ? Number(update.price) * Math.pow(10, update.exponent) : 0;
      const bnbBalance = Number(bnbRaw) / 1e18;

      return {
        bnbBalance,
        bnbUsdValue: bnbBalance * bnbPrice,
        usdtCollateralUsd: usdtBalance,
        totalUsd: bnbBalance * bnbPrice + usdtBalance,
      };
    } catch {
      return {
        bnbBalance: 0,
        bnbUsdValue: 0,
        usdtCollateralUsd: 0,
        totalUsd: 0,
      };
    }
  }
}
