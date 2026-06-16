import { spawn } from 'node:child_process';
import {
  BSC_USDT_ADDRESS,
  BSC_CAKE_ADDRESS,
  BSC_WBNB_ADDRESS,
  BSC_BUSD_ADDRESS,
} from '@/config/chains';
import { DRY_RUN_MODE, ENABLE_EXECUTION } from '@/config/features';
import { MAX_SLIPPAGE_PCT } from '@/config/execution';
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
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
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
    const argsArr = ['balance', '--address', args.address, '--chain', TWAK_CHAIN, '--json'];
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

    const native = await this.getBalance({ address: args.agentAddress });
    if (native.totalUsd && native.totalUsd > 0) totalUSD += native.totalUsd;

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
        console.error(
          `[twak] portfolio read for ${symbol} failed:`,
          err instanceof Error ? err.message : String(err),
        );
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
}

export const twakClient = new TWAKClient();
