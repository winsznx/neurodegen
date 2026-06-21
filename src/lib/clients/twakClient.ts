import { spawn } from 'node:child_process';
import {
  BSC_USDT_ADDRESS,
  BSC_CAKE_ADDRESS,
  BSC_WBNB_ADDRESS,
  BSC_BUSD_ADDRESS,
} from '@/config/chains';
import { DRY_RUN_MODE, ENABLE_EXECUTION } from '@/config/features';
import { MAX_SLIPPAGE_PCT } from '@/config/execution';
import {
  readErc20Balance,
  readNativeBalance,
} from './erc20BalanceFallback';
import type {
  TWAKPortfolioSnapshot,
  TWAKSwapResult,
  TWAKSwapQuote,
} from '@/types/execution';

const TWAK_BIN = process.env.TWAK_BIN ?? 'twak';
const TWAK_CHAIN = 'bsc' as const;

const DEFAULT_TRACKED_TOKENS: Record<string, `0x${string}`> = {
  USDT: BSC_USDT_ADDRESS,
  BUSD: BSC_BUSD_ADDRESS,
  CAKE: BSC_CAKE_ADDRESS,
  WBNB: BSC_WBNB_ADDRESS,
};

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const TWAK_CLI_TIMEOUT_MS = Number(process.env.TWAK_CLI_TIMEOUT_MS ?? '45000');

async function runTwak(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TWAK_BIN, args, {
      env: {
        ...process.env,
        TWAK_WALLET_PASSWORD: process.env.TWAK_WALLET_PASSWORD ?? '',
      },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    // Hard timeout: if TWAK hangs (network, dead process, stuck prompt) we
    // kill the child and reject with a typed error. Prevents the agent loop
    // from stalling indefinitely on a single signing op.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
      reject(
        new Error(
          `twak [${args[0] ?? '?'}] timed out after ${TWAK_CLI_TIMEOUT_MS}ms; partial stderr=${stderr.slice(0, 200)}`,
        ),
      );
    }, TWAK_CLI_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}

function parseJsonOutput<T>(stdout: string, what: string): T {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new Error(
      `${what}: failed to parse twak JSON output: ${err instanceof Error ? err.message : String(err)}\n--- stdout ---\n${trimmed.slice(0, 2000)}`,
    );
  }
}

function syntheticTxHash(seed: string): `0x${string}` {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, '0');
  return `0x${hex.repeat(8)}` as `0x${string}`;
}

export interface RegisterResult {
  txHash: `0x${string}`;
  alreadyRegistered: boolean;
  participant: `0x${string}`;
  deadline: string;
  chain: 'bsc';
}

export interface CompetitionStatus {
  registered: boolean;
  participant: `0x${string}` | null;
  deadline: string | null;
}

interface RawCompeteResult {
  registered: boolean;
  alreadyRegistered?: boolean;
  participant?: string;
  deadline?: string;
  chain?: string;
  txHash?: string;
}

interface RawBalanceResult {
  address: string;
  chain: string;
  symbol: string;
  token?: string;
  available: string;
  staked?: string;
  total: string;
  totalUsd: number | null;
}

interface RawQuoteResult {
  input: string;
  output: string;
  minReceived: string;
  provider: string;
  priceImpact: number;
  networkFee: string;
  steps: unknown[];
}

interface RawSwapResult extends RawQuoteResult {
  hash: string;
  fromChain: string;
  toChain: string;
  explorer: string;
}

interface RawX402Result {
  proofHeader: string;
  settlementTxHash: string;
  paidAtomic: string;
}

export class TWAKClient {
  async register(): Promise<RegisterResult> {
    if (DRY_RUN_MODE) {
      return {
        txHash: syntheticTxHash('register'),
        alreadyRegistered: false,
        participant:
          (process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}` | undefined) ??
          ('0x0000000000000000000000000000000000000000' as `0x${string}`),
        deadline:
          process.env.COMPETITION_REGISTRATION_DEADLINE ?? '2026-06-22T00:00:00Z',
        chain: 'bsc',
      };
    }
    const { exitCode, stdout, stderr } = await runTwak(['compete', 'register', '--json']);
    if (exitCode !== 0) {
      throw new Error(`twak compete register failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawCompeteResult>(stdout, 'twak compete register');
    return {
      txHash: (raw.txHash ?? '0x0') as `0x${string}`,
      alreadyRegistered: raw.alreadyRegistered === true,
      participant: (raw.participant ?? '0x0') as `0x${string}`,
      deadline: raw.deadline ?? '',
      chain: 'bsc',
    };
  }

  async getCompetitionStatus(): Promise<CompetitionStatus> {
    if (DRY_RUN_MODE) {
      return {
        registered: false,
        participant: null,
        deadline: process.env.COMPETITION_REGISTRATION_DEADLINE ?? null,
      };
    }
    const { exitCode, stdout, stderr } = await runTwak(['compete', 'status', '--json']);
    if (exitCode !== 0) {
      throw new Error(`twak compete status failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawCompeteResult>(stdout, 'twak compete status');
    return {
      registered: raw.registered === true,
      participant: (raw.participant as `0x${string}` | undefined) ?? null,
      deadline: raw.deadline ?? null,
    };
  }

  async getBalance(args: {
    address: `0x${string}`;
    tokenAddress?: `0x${string}`;
  }): Promise<{ symbol: string; total: string; totalUsd: number | null }> {
    if (DRY_RUN_MODE) {
      return { symbol: 'BNB', total: '0', totalUsd: 0 };
    }
    // TWAK CLI 0.19.x: `twak wallet balance` reads the keystore at ~/.twak/wallet.json,
    // not an external address. The wallet at boot IS the agent wallet. There is no
    // `--address` flag any more (older docs are stale). Passing it produces
    // "unknown option '--address'" and exit=1 with empty stderr that we saw in the
    // agent-loop logs.
    const argsArr = ['wallet', 'balance', '--chain', TWAK_CHAIN, '--json'];
    if (args.tokenAddress) {
      argsArr.push('--token', args.tokenAddress);
    }
    const { exitCode, stdout, stderr } = await runTwak(argsArr);
    if (exitCode !== 0) {
      throw new Error(`twak balance failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawBalanceResult>(stdout, 'twak balance');
    return { symbol: raw.symbol, total: raw.total, totalUsd: raw.totalUsd };
  }

  async getPortfolio(args: {
    agentAddress: `0x${string}`;
    trackedTokens?: Record<string, `0x${string}`>;
  }): Promise<TWAKPortfolioSnapshot> {
    const tokens = args.trackedTokens ?? DEFAULT_TRACKED_TOKENS;
    const entries: Array<{
      tokenSymbol: string;
      tokenAddress: `0x${string}`;
      balanceTokens: string;
      valueUSD: number;
    }> = [];
    let totalUSD = 0;

    // Native BNB balance. V2 Phase H fix: previously this line was un-guarded
    // and a single TWAK CLI hiccup (exit=1, account-flagged, keystore locked)
    // crashed the entire cycle before execution could be attempted. Now we
    // try TWAK first, fall back to a direct BSC RPC `eth_getBalance` read on
    // failure — read-only, no signing, self-custody preserved.
    try {
      const native = await this.getBalance({ address: args.agentAddress });
      if (native.totalUsd && native.totalUsd > 0) totalUSD += native.totalUsd;
    } catch (err) {
      console.warn(
        '[twak] native balance via TWAK failed; falling back to viem:',
        err instanceof Error ? err.message : String(err),
      );
      try {
        await readNativeBalance(args.agentAddress);
        // We don't have a BNB/USD price here without an additional call;
        // contribute zero to the portfolio total but record the read worked
        // so the cycle keeps going. The cognition layer ingests CMC quotes
        // independently for sizing — this fallback is just to keep the
        // drawdown / risk-state math from going to NaN.
      } catch (innerErr) {
        console.error(
          '[twak] native balance viem fallback ALSO failed:',
          innerErr instanceof Error ? innerErr.message : String(innerErr),
        );
      }
    }

    for (const [symbol, address] of Object.entries(tokens)) {
      try {
        const bal = await this.getBalance({ address: args.agentAddress, tokenAddress: address });
        const valueUSD = bal.totalUsd ?? 0;
        if (parseFloat(bal.total) > 0 || valueUSD > 0) {
          entries.push({
            tokenSymbol: symbol,
            tokenAddress: address,
            balanceTokens: bal.total,
            valueUSD,
          });
          totalUSD += valueUSD;
        }
      } catch (err) {
        // A single token failure shouldn't blow up the whole portfolio read.
        // V2 Phase H: ALSO try the viem fallback per token so we still surface
        // balances when TWAK is misbehaving. USD valuation is left at 0 because
        // we don't have an oracle price wired into this read path — but having
        // a non-zero `balanceTokens` is enough for the executor to size sells
        // against and for the position tracker to compute PnL on closes.
        console.warn(
          `[twak] portfolio read for ${symbol} via TWAK failed; trying viem:`,
          err instanceof Error ? err.message : String(err),
        );
        try {
          const fallback = await readErc20Balance({
            holder: args.agentAddress,
            tokenAddress: address,
            symbol,
          });
          if (fallback.rawBalance > 0n) {
            entries.push({
              tokenSymbol: symbol,
              tokenAddress: address,
              balanceTokens: fallback.balanceTokens,
              valueUSD: 0,
            });
          }
        } catch (fallbackErr) {
          console.error(
            `[twak] viem fallback for ${symbol} ALSO failed:`,
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          );
        }
      }
    }

    return {
      totalValueUSD: totalUSD,
      positions: entries,
      drawdownFromPeak: 0,
      availableCapitalUSD: totalUSD,
      snapshotAt: Date.now(),
    };
  }

  async quoteSwap(args: {
    fromTokenSymbol: string;
    toTokenSymbol: string;
    amountTokens: string;
    slippagePct?: number;
  }): Promise<TWAKSwapQuote> {
    const slippage = args.slippagePct ?? MAX_SLIPPAGE_PCT * 100;
    if (DRY_RUN_MODE) {
      const outAmount = (Number(args.amountTokens) * 0.995).toString();
      return {
        inputTokens: args.amountTokens,
        outputTokens: outAmount,
        minReceivedTokens: outAmount,
        provider: 'dry-run',
        priceImpactPct: 0,
        networkFeeUSD: 0,
      };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'swap',
      args.amountTokens,
      args.fromTokenSymbol,
      args.toTokenSymbol,
      '--chain',
      TWAK_CHAIN,
      '--slippage',
      slippage.toFixed(4),
      '--quote-only',
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak swap --quote-only failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawQuoteResult>(stdout, 'twak swap quote');
    return {
      inputTokens: raw.input,
      outputTokens: raw.output,
      minReceivedTokens: raw.minReceived,
      provider: raw.provider,
      priceImpactPct: raw.priceImpact,
      networkFeeUSD: parseFloat(raw.networkFee) || 0,
    };
  }

  async executeSwap(args: {
    fromTokenSymbol: string;
    toTokenSymbol: string;
    amountTokens: string;
    slippagePct?: number;
  }): Promise<TWAKSwapResult> {
    if (!ENABLE_EXECUTION) {
      throw new Error('twak.executeSwap blocked: ENABLE_EXECUTION=false');
    }
    if (DRY_RUN_MODE) {
      const outAmount = (Number(args.amountTokens) * 0.995).toString();
      const seed = `${args.fromTokenSymbol}:${args.toTokenSymbol}:${args.amountTokens}:${Date.now()}`;
      return {
        txHash: syntheticTxHash(seed),
        fromAmountTokens: args.amountTokens,
        toAmountTokens: outAmount,
        explorer: 'https://bscscan.com/tx/0xdryrun',
        provider: 'dry-run',
        executedPriceUSD: 0,
      };
    }
    const slippage = args.slippagePct ?? MAX_SLIPPAGE_PCT * 100;
    const { exitCode, stdout, stderr } = await runTwak([
      'swap',
      args.amountTokens,
      args.fromTokenSymbol,
      args.toTokenSymbol,
      '--chain',
      TWAK_CHAIN,
      '--slippage',
      slippage.toFixed(4),
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak swap failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawSwapResult>(stdout, 'twak swap');
    return {
      txHash: raw.hash as `0x${string}`,
      fromAmountTokens: raw.input,
      toAmountTokens: raw.output,
      explorer: raw.explorer,
      provider: raw.provider,
      executedPriceUSD: 0,
    };
  }

  async payX402(args: {
    url: string;
    maxPaymentAtomic: bigint;
  }): Promise<{ proofHeader: string; settlementTxHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return {
        proofHeader: 'dry-run-x402-proof',
        settlementTxHash: syntheticTxHash(`x402:${args.url}`),
      };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'x402',
      'request',
      args.url,
      '--max-payment',
      args.maxPaymentAtomic.toString(),
      '--yes',
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak x402 request failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawX402Result>(stdout, 'twak x402');
    return {
      proofHeader: raw.proofHeader,
      settlementTxHash: raw.settlementTxHash as `0x${string}`,
    };
  }

  // =====================================================================
  // ERC-8004 (Identity Registry) - BSC mainnet: 0x8004A169…a432
  // =====================================================================

  async erc8004Register(args: {
    uri: string;
  }): Promise<{ agentId: string; txHash: `0x${string}`; alreadyRegistered: boolean }> {
    if (DRY_RUN_MODE) {
      return {
        agentId: '0',
        txHash: syntheticTxHash(`erc8004:register:${args.uri.slice(0, 32)}`),
        alreadyRegistered: false,
      };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'erc8004',
      'register',
      '--uri',
      args.uri,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak erc8004 register failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<RawErc8004RegisterResult>(stdout, 'twak erc8004 register');
    return {
      agentId: String(raw.agentId ?? raw.tokenId ?? '0'),
      txHash: (raw.txHash ?? '0x0') as `0x${string}`,
      alreadyRegistered: raw.alreadyRegistered === true,
    };
  }

  async erc8004SetUri(args: {
    agentId: string;
    uri: string;
  }): Promise<{ txHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return { txHash: syntheticTxHash(`erc8004:set-uri:${args.agentId}`) };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'erc8004',
      'set-uri',
      '--agent-id',
      args.agentId,
      '--uri',
      args.uri,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak erc8004 set-uri failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ txHash?: string }>(stdout, 'twak erc8004 set-uri');
    return { txHash: (raw.txHash ?? '0x0') as `0x${string}` };
  }

  // =====================================================================
  // ERC-8183 (Agentic Commerce) - BSC mainnet: 0xea4daa…eba6
  // =====================================================================

  async erc8183CreateJob(args: {
    provider: `0x${string}`;
    evaluator: `0x${string}`;
    expiredAt: number;
    description: string;
    hook?: `0x${string}`;
  }): Promise<{ jobId: string; txHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return {
        jobId: '0',
        txHash: syntheticTxHash(`erc8183:create-job:${args.description.slice(0, 32)}`),
      };
    }
    const cliArgs = [
      'erc8183',
      'create-job',
      '--provider',
      args.provider,
      '--evaluator',
      args.evaluator,
      '--expired-at',
      String(args.expiredAt),
      '--description',
      args.description,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ];
    if (args.hook) {
      cliArgs.push('--hook', args.hook);
    }
    const { exitCode, stdout, stderr } = await runTwak(cliArgs);
    if (exitCode !== 0) {
      throw new Error(`twak erc8183 create-job failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ jobId?: string | number; txHash?: string }>(
      stdout,
      'twak erc8183 create-job',
    );
    return {
      jobId: String(raw.jobId ?? '0'),
      txHash: (raw.txHash ?? '0x0') as `0x${string}`,
    };
  }

  async erc8183SetBudget(args: {
    jobId: string;
    amount: string;
  }): Promise<{ txHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return { txHash: syntheticTxHash(`erc8183:set-budget:${args.jobId}`) };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'erc8183',
      'set-budget',
      '--job-id',
      args.jobId,
      '--amount',
      args.amount,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak erc8183 set-budget failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ txHash?: string }>(stdout, 'twak erc8183 set-budget');
    return { txHash: (raw.txHash ?? '0x0') as `0x${string}` };
  }

  async erc8183Fund(args: {
    jobId: string;
    expectedBudget: string;
  }): Promise<{ txHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return { txHash: syntheticTxHash(`erc8183:fund:${args.jobId}`) };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'erc8183',
      'fund',
      '--job-id',
      args.jobId,
      '--expected-budget',
      args.expectedBudget,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak erc8183 fund failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ txHash?: string }>(stdout, 'twak erc8183 fund');
    return { txHash: (raw.txHash ?? '0x0') as `0x${string}` };
  }

  async erc8183Submit(args: {
    jobId: string;
    deliverable: `0x${string}`;
    deliverableUrl?: string;
  }): Promise<{ txHash: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return { txHash: syntheticTxHash(`erc8183:submit:${args.jobId}`) };
    }
    const cliArgs = [
      'erc8183',
      'submit',
      '--job-id',
      args.jobId,
      '--deliverable',
      args.deliverable,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ];
    if (args.deliverableUrl) {
      cliArgs.push('--deliverable-url', args.deliverableUrl);
    }
    const { exitCode, stdout, stderr } = await runTwak(cliArgs);
    if (exitCode !== 0) {
      throw new Error(`twak erc8183 submit failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ txHash?: string }>(stdout, 'twak erc8183 submit');
    return { txHash: (raw.txHash ?? '0x0') as `0x${string}` };
  }

  // =====================================================================
  // EIP-191 personal_sign - used by ERC-8183 NegotiationHandler provider_sig
  // =====================================================================

  async walletSignMessage(args: {
    message: string;
  }): Promise<{ signature: `0x${string}`; digest: `0x${string}` }> {
    if (DRY_RUN_MODE) {
      return {
        signature: syntheticTxHash(`sign:${args.message.slice(0, 32)}`),
        digest: syntheticTxHash(`digest:${args.message.slice(0, 32)}`),
      };
    }
    const { exitCode, stdout, stderr } = await runTwak([
      'wallet',
      'sign-message',
      '--message',
      args.message,
      '--chain',
      TWAK_CHAIN,
      '--json',
    ]);
    if (exitCode !== 0) {
      throw new Error(`twak wallet sign-message failed [exit=${exitCode}]: ${stderr}`);
    }
    const raw = parseJsonOutput<{ signature?: string; digest?: string }>(
      stdout,
      'twak wallet sign-message',
    );
    return {
      signature: (raw.signature ?? '0x0') as `0x${string}`,
      digest: (raw.digest ?? '0x0') as `0x${string}`,
    };
  }
}

interface RawErc8004RegisterResult {
  agentId?: string | number;
  tokenId?: string | number;
  txHash?: string;
  alreadyRegistered?: boolean;
}

export const twakClient = new TWAKClient();
