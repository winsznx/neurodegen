import { decodeEventLog, type Log } from 'viem';
import { logsPublicClient } from '@/lib/clients/chain';
import { fourMemeTokenManagerAbi } from '@/lib/abis/fourMemeTokenManager';
import { FOURMEME_TOKEN_MANAGER } from '@/config/chains';
import { FOURMEME_BACKFILL_BLOCKS, FOURMEME_GET_LOGS_MAX_RANGE } from '@/config/perception';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PerceptionEvent, LaunchEvent, PurchaseEvent, GraduationEvent } from '@/types/perception';

const POLL_INTERVAL_MS = 10_000;
const MAX_CONSECUTIVE_ERRORS = 5;
const BACKOFF_MS = 30_000;

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
      initialSupplyOnCurve: decoded.args.totalSupply,
    } satisfies LaunchEvent;
  }

  if (decoded.eventName === 'TokenPurchase') {
    return {
      ...base,
      eventType: 'token_purchase',
      tokenAddress: decoded.args.token,
      buyerAddress: decoded.args.account,
      bnbAmount: decoded.args.funds,
      tokenAmount: decoded.args.amount,
      currentCurveBalance: decoded.args.offers,
    } satisfies PurchaseEvent;
  }

  if (decoded.eventName === 'LiquidityAdded') {
    return {
      ...base,
      eventType: 'liquidity_added',
      tokenAddress: decoded.args.base,
      bnbAccumulated: decoded.args.funds,
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

  private async fetchLogsInChunks(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    const maxRange = BigInt(Math.max(FOURMEME_GET_LOGS_MAX_RANGE, 1));
    const maxSpan = maxRange > 0n ? maxRange - 1n : 0n;
    const allLogs: Log[] = [];
    let cursor = fromBlock;

    while (cursor <= toBlock) {
      const chunkTo = cursor + maxSpan < toBlock ? cursor + maxSpan : toBlock;
      const logs = await logsPublicClient.getLogs({
        address: FOURMEME_TOKEN_MANAGER as `0x${string}`,
        events: fourMemeTokenManagerAbi,
        fromBlock: cursor,
        toBlock: chunkTo,
      });
      allLogs.push(...logs);
      cursor = chunkTo + 1n;
    }

    return allLogs;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const toBlock = await logsPublicClient.getBlockNumber();
      const backfillBlocks = BigInt(Math.max(FOURMEME_BACKFILL_BLOCKS, 1));
      const fromBlock = this.lastBlock !== null
        ? this.lastBlock + 1n
        : toBlock > backfillBlocks
          ? toBlock - backfillBlocks
          : 0n;

      if (fromBlock > toBlock) {
        this.scheduleNext();
        return;
      }

      const logs = await this.fetchLogsInChunks(fromBlock, toBlock);

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
