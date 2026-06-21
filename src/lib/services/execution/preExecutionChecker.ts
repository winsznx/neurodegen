import {
  ORACLE_DIVERGENCE_MAX_PCT,
  MAX_SLIPPAGE_PCT,
  SECURITY_RISK_SCORE_MAX,
  GAS_BUFFER_BNB,
} from '@/config/execution';
import { ENABLE_MOMENTUM_FILTER } from '@/config/features';
import { MIN_POSITION_SIZE_USD } from '@/config/risk';
import { isAllowedTokenSymbol } from '@/lib/utils/allowedTokens';
import type {
  PreExecutionCheckEntry,
  PreExecutionCheckResult,
  PositionState,
  RiskManagerState,
  TWAKPortfolioSnapshot,
} from '@/types/execution';
import type { ActionRecommendation } from '@/types/cognition';
import type { PythHermesClient } from '@/lib/clients/pyth';
import type { TWAKClient } from '@/lib/clients/twakClient';
import type { RiskManager } from './riskManager';
import { publicClient } from '@/lib/clients/chain';
import { BSC_WBNB_ADDRESS } from '@/config/chains';

interface PreExecutionCheckerDeps {
  twak: TWAKClient;
  pyth: PythHermesClient;
  risk: RiskManager;
}

export interface PreExecutionCheckerInputs {
  recommendation: ActionRecommendation;
  state: RiskManagerState;
  openPositions: PositionState[];
  cmcPriceUSD: number | null;
  pythSymbol: 'BTC_USD' | 'ETH_USD' | 'BNB_USD' | null;
  liquidityAdequate: boolean;
  fundingRateWarning: boolean;
  securityRiskScore: number | null;
  isHoneypot: boolean | null;
  portfolio: TWAKPortfolioSnapshot;
  agentAddress: `0x${string}`;
  /**
   * Phase I momentum filter inputs. When both pct1h and pct24h are non-positive
   * for an `open_long` recommendation, the filter rejects the trade (refuses
   * to catch a falling knife). Pass null when no recent quote is available for
   * the symbol — the filter is pass-through in that case (better than blocking
   * trades on missing data).
   */
  tokenMomentum: { pct1h: number | null; pct24h: number | null } | null;
}

export class PreExecutionChecker {
  constructor(private readonly deps: PreExecutionCheckerDeps) {}

  async runChecks(inputs: PreExecutionCheckerInputs): Promise<PreExecutionCheckResult> {
    const checks: PreExecutionCheckEntry[] = [];

    checks.push(this.allowedTokenVerified(inputs.recommendation));
    checks.push(this.securityCheckPassed(inputs));
    checks.push(await this.pythOracleDivergence(inputs));
    checks.push(this.liquidityAdequate(inputs));
    checks.push(this.fundingRateSafe(inputs));
    checks.push(this.momentumNotAdverse(inputs));
    checks.push(this.slippageWithinTolerance(inputs));
    checks.push(await this.collateralAvailable(inputs));
    checks.push(this.riskManagerApproval(inputs));

    const allPassed = checks.every((c) => c.passed);
    const riskCheck = checks[checks.length - 1];
    const adjustedSize = typeof riskCheck.value === 'number' ? riskCheck.value : 0;
    return {
      passed: allPassed && adjustedSize > 0,
      adjustedPositionSizeUSD: adjustedSize,
      checks,
    };
  }

  private allowedTokenVerified(recommendation: ActionRecommendation): PreExecutionCheckEntry {
    const symbol = recommendation.tokenSymbol;
    if (recommendation.action === 'close_position') {
      return { name: 'allowed_token_verified', passed: true, value: 'close', threshold: 'allowed', message: 'close path' };
    }
    if (!symbol) {
      return { name: 'allowed_token_verified', passed: false, value: 'null', threshold: 'allowed', message: 'targetToken missing' };
    }
    if (!isAllowedTokenSymbol(symbol)) {
      return {
        name: 'allowed_token_verified',
        passed: false,
        value: symbol,
        threshold: 'allowed',
        message: `${symbol} not in 149-token allowlist`,
      };
    }
    return { name: 'allowed_token_verified', passed: true, value: symbol, threshold: 'allowed', message: 'ok' };
  }

  private securityCheckPassed(inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    if (inputs.recommendation.action === 'close_position') {
      return { name: 'security_check_passed', passed: true, value: 'close', threshold: SECURITY_RISK_SCORE_MAX, message: 'close path' };
    }
    if (inputs.isHoneypot === true) {
      return {
        name: 'security_check_passed',
        passed: false,
        value: 'honeypot',
        threshold: SECURITY_RISK_SCORE_MAX,
        message: 'CMC security flagged honeypot',
      };
    }
    const score = inputs.securityRiskScore ?? 0;
    const passed = score < SECURITY_RISK_SCORE_MAX;
    return {
      name: 'security_check_passed',
      passed,
      value: score,
      threshold: SECURITY_RISK_SCORE_MAX,
      message: passed ? 'ok' : `risk score ${score} ≥ ${SECURITY_RISK_SCORE_MAX}`,
    };
  }

  private async pythOracleDivergence(
    inputs: PreExecutionCheckerInputs,
  ): Promise<PreExecutionCheckEntry> {
    if (!inputs.pythSymbol || inputs.cmcPriceUSD === null) {
      return {
        name: 'pyth_oracle_divergence',
        passed: true,
        value: 'skipped',
        threshold: ORACLE_DIVERGENCE_MAX_PCT,
        message: 'no Pyth feed for target token; skipped',
      };
    }
    try {
      const fetched = await this.deps.pyth.fetchSinglePrice(inputs.pythSymbol);
      const divergence =
        fetched.priceUSD > 0
          ? Math.abs(fetched.priceUSD - inputs.cmcPriceUSD) / fetched.priceUSD
          : 0;
      const passed = divergence < ORACLE_DIVERGENCE_MAX_PCT;
      return {
        name: 'pyth_oracle_divergence',
        passed,
        value: divergence,
        threshold: ORACLE_DIVERGENCE_MAX_PCT,
        message: passed
          ? `divergence ${(divergence * 100).toFixed(3)}% within tolerance`
          : `divergence ${(divergence * 100).toFixed(3)}% > ${(ORACLE_DIVERGENCE_MAX_PCT * 100).toFixed(2)}%`,
      };
    } catch (err) {
      return {
        name: 'pyth_oracle_divergence',
        passed: false,
        value: 'error',
        threshold: ORACLE_DIVERGENCE_MAX_PCT,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private liquidityAdequate(inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    const passed = inputs.liquidityAdequate;
    return {
      name: 'liquidity_adequate',
      passed,
      value: passed ? 'adequate' : 'inadequate',
      threshold: 'adequate',
      message: passed ? 'ok' : 'quant flagged inadequate liquidity',
    };
  }

  private fundingRateSafe(inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    if (inputs.fundingRateWarning && inputs.recommendation.action === 'open_long') {
      return {
        name: 'funding_rate_safe',
        passed: false,
        value: 'warning',
        threshold: 'safe',
        message: 'quant flagged funding rate warning for an open_long',
      };
    }
    return { name: 'funding_rate_safe', passed: true, value: 'safe', threshold: 'safe', message: 'ok' };
  }

  /**
   * Phase I "don't catch a falling knife" filter. Applied ONLY to `open_long`.
   * Rules:
   *  - Pass when the filter is disabled, the action is not `open_long`, or
   *    momentum data is unavailable for the symbol.
   *  - Fail when BOTH pct1h ≤ 0 AND pct24h ≤ 0 (token has been bleeding on
   *    both timeframes).
   *  - Otherwise pass.
   *
   * This is a deterministic rule, not "alpha". It exists to stop the LLM
   * committee from entering longs into multi-timeframe downtrends — which
   * has been the dominant failure mode for spot agents this competition
   * week per the chat consensus.
   */
  private momentumNotAdverse(inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    if (!ENABLE_MOMENTUM_FILTER) {
      return {
        name: 'momentum_not_adverse',
        passed: true,
        value: 'disabled',
        threshold: 'pct1h>0 OR pct24h>0',
        message: 'ENABLE_MOMENTUM_FILTER=false; filter skipped',
      };
    }
    if (inputs.recommendation.action !== 'open_long') {
      return {
        name: 'momentum_not_adverse',
        passed: true,
        value: inputs.recommendation.action,
        threshold: 'pct1h>0 OR pct24h>0',
        message: 'filter only applies to open_long',
      };
    }
    const pct1h = inputs.tokenMomentum?.pct1h ?? null;
    const pct24h = inputs.tokenMomentum?.pct24h ?? null;
    if (pct1h === null || pct24h === null) {
      return {
        name: 'momentum_not_adverse',
        passed: true,
        value: 'no_data',
        threshold: 'pct1h>0 OR pct24h>0',
        message: 'no recent CMC quote for symbol; filter pass-through',
      };
    }
    const adverse = pct1h <= 0 && pct24h <= 0;
    if (adverse) {
      return {
        name: 'momentum_not_adverse',
        passed: false,
        value: `1h=${pct1h.toFixed(2)}% 24h=${pct24h.toFixed(2)}%`,
        threshold: 'pct1h>0 OR pct24h>0',
        message: `refused open_long into multi-timeframe downtrend (1h=${pct1h.toFixed(2)}%, 24h=${pct24h.toFixed(2)}%)`,
      };
    }
    return {
      name: 'momentum_not_adverse',
      passed: true,
      value: `1h=${pct1h.toFixed(2)}% 24h=${pct24h.toFixed(2)}%`,
      threshold: 'pct1h>0 OR pct24h>0',
      message: 'at least one timeframe is non-negative',
    };
  }

  private slippageWithinTolerance(_inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    // Slippage is enforced per-swap via twak's --slippage flag in twakExecutor.
    // This check confirms the configured tolerance is still within the absolute cap.
    const passed = MAX_SLIPPAGE_PCT <= 0.02;
    return {
      name: 'slippage_within_tolerance',
      passed,
      value: MAX_SLIPPAGE_PCT,
      threshold: 0.02,
      message: passed ? `swap will use slippage ${(MAX_SLIPPAGE_PCT * 100).toFixed(2)}%` : `slippage ${MAX_SLIPPAGE_PCT} above 2% absolute cap`,
    };
  }

  private async collateralAvailable(
    inputs: PreExecutionCheckerInputs,
  ): Promise<PreExecutionCheckEntry> {
    const requestedUSD = inputs.recommendation.positionSizeUSD ?? 0;
    const availableUSD = inputs.portfolio.availableCapitalUSD;
    if (availableUSD < requestedUSD || requestedUSD < MIN_POSITION_SIZE_USD) {
      return {
        name: 'collateral_available',
        passed: false,
        value: availableUSD,
        threshold: requestedUSD,
        message: `available $${availableUSD.toFixed(2)} < requested $${requestedUSD.toFixed(2)}`,
      };
    }
    // BNB gas headroom check via direct chain read so a TWAK-portfolio stale read
    // can't hide an empty gas tank.
    try {
      const balance = await publicClient.getBalance({ address: inputs.agentAddress });
      const bnb = Number(balance) / 1e18;
      if (bnb < GAS_BUFFER_BNB) {
        return {
          name: 'collateral_available',
          passed: false,
          value: bnb,
          threshold: GAS_BUFFER_BNB,
          message: `agent BNB ${bnb.toFixed(5)} < ${GAS_BUFFER_BNB} gas buffer`,
        };
      }
    } catch (err) {
      return {
        name: 'collateral_available',
        passed: false,
        value: 'error',
        threshold: GAS_BUFFER_BNB,
        message: `chain read failed: ${err instanceof Error ? err.message : String(err)} (WBNB=${BSC_WBNB_ADDRESS})`,
      };
    }
    return {
      name: 'collateral_available',
      passed: true,
      value: availableUSD,
      threshold: requestedUSD,
      message: `$${availableUSD.toFixed(2)} available`,
    };
  }

  private riskManagerApproval(inputs: PreExecutionCheckerInputs): PreExecutionCheckEntry {
    const verdict = this.deps.risk.canAct(
      inputs.recommendation,
      inputs.state,
      inputs.openPositions,
      inputs.portfolio.totalValueUSD,
    );
    return {
      name: 'risk_manager_approval',
      passed: verdict.approved,
      value: verdict.adjustedPositionSizeUSD ?? 0,
      threshold: inputs.recommendation.positionSizeUSD ?? 0,
      message: verdict.approved
        ? `approved at $${(verdict.adjustedPositionSizeUSD ?? 0).toFixed(2)}`
        : (verdict.rejectionReason ?? 'rejected'),
    };
  }
}
