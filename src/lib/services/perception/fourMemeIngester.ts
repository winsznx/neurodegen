import { decodeEventLog, type Log } from 'viem';
import { logsPublicClient } from '@/lib/clients/chain';
import { fourMemeTokenManagerAbi } from '@/lib/abis/fourMemeTokenManager';
import { FOURMEME_TOKEN_MANAGER } from '@/config/chains';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PerceptionEvent, LaunchEvent, PurchaseEvent, GraduationEvent } from '@/types/perception';

const POLL_INTERVAL_MS = 10_000;
const BACKFILL_BLOCKS = 20n;
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_MS = 30_000;

const GRADUATION_EVENT_TYPES = {
  LiquidityAdded: 'liquidity_added',
  PairCreated: 'pair_created',
  PoolCreated: 'pool_created',
} as const satisfies Record<string, GraduationEvent['eventType']>;

function decodeLog(log: Log): PerceptionEvent | null {
  let decoded: ReturnType<typeof decodeEventLog<typeof fourMemeTokenManagerAbi>>;
  try {
    decoded = decodeEventLog({
      abi: fourMemeTokenManagerAbi,
      data: log.data,
      topics: log.topics,
    });
  } catch {
    return null;
  }

  const base = {
    eventId: crypto.randomUUID(),
    source: 'fourmeme' as const,
    timestamp: Date.now(),
    blockNumber: log.blockNumber !== null ? Number(log.blockNumber) : null,
    rawHash: log.transactionHash ?? null,
  };

  if (decoded.eventName === 'TokenCreate') {
    return {
      ...base,
      eventType: 'token_create',
      tokenAddress: decoded.args.token,
      creatorAddress: decoded.args.creator,
      tokenName: decoded.args.name,
      tokenSymbol: decoded.args.symbol,
      initialSupplyOnCurve: decoded.args.initialSupply,
    } satisfies LaunchEvent;
  }

  if (decoded.eventName === 'TokenPurchase') {
    return {
      ...base,
      eventType: 'token_purchase',
      tokenAddress: decoded.args.token,
      buyerAddress: decoded.args.buyer,
      bnbAmount: decoded.args.bnbAmount,
      tokenAmount: decoded.args.tokenAmount,
      currentCurveBalance: decoded.args.curveBalance,
    } satisfies PurchaseEvent;
  }

  const gradType = GRADUATION_EVENT_TYPES[decoded.eventName as keyof typeof GRADUATION_EVENT_TYPES];
  if (gradType) {
    const gradArgs = decoded.args as { token: `0x${string}`; bnbAmount?: bigint; lpBurned?: boolean };
    return {
      ...base,
      eventType: gradType,
      tokenAddress: gradArgs.token,
      bnbAccumulated: gradArgs.bnbAmount ?? 0n,
      lpTokensBurned: gradArgs.lpBurned ?? false,
    } satisfies GraduationEvent;
  }

  return null;
}

export class FourMemeIngester {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastBlock: bigint | null = null;
  private consecutiveErrors = 0;

  constructor(
    private readonly hotState: HotStateStore,
    private readonly onEvent: (event: PerceptionEvent) => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(0);
    console.log('[four-meme-ingester] started (BSC getLogs polling, 3s interval)');
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    console.log('[four-meme-ingester] stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private scheduleNext(delayMs: number = POLL_INTERVAL_MS): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const toBlock = await logsPublicClient.getBlockNumber();
      const fromBlock = this.lastBlock !== null ? this.lastBlock + 1n : toBlock - BACKFILL_BLOCKS;

      if (fromBlock > toBlock) {
        this.scheduleNext();
        return;
      }

      const logs = await logsPublicClient.getLogs({
        address: FOURMEME_TOKEN_MANAGER as `0x${string}`,
        events: fourMemeTokenManagerAbi,
        fromBlock,
        toBlock,
      });

      this.lastBlock = toBlock;
      this.consecutiveErrors = 0;

      for (const log of logs) {
        const event = decodeLog(log);
        if (event) {
          this.hotState.addEvent(event);
          this.onEvent(event);
        }
      }
    } catch (err) {
      this.consecutiveErrors++;
      const detail = err instanceof Error ? err.message : String(err);
      if (this.consecutiveErrors === MAX_CONSECUTIVE_ERRORS) {
        console.error(`[four-meme-ingester] ${MAX_CONSECUTIVE_ERRORS} consecutive errors, backing off to ${BACKOFF_MS}ms. Last: ${detail}`);
      } else if (this.consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
        console.warn(`[four-meme-ingester] poll error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${detail}`);
      }
      const delay = this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS ? BACKOFF_MS : POLL_INTERVAL_MS;
      this.scheduleNext(delay);
      return;
    }

    this.scheduleNext();
  }
}
