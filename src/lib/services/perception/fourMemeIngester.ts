import type { BitqueryClient } from '@/lib/clients/bitquery';
import type { HotStateStore } from '@/lib/stores/hotState';
import type { PerceptionEvent } from '@/types/perception';
import { normalizeFourMemeEvent } from './eventNormalizer';
import { FOURMEME_TOKEN_MANAGER } from '@/config/chains';

const SUBSCRIPTIONS: Array<{ eventName: string; signatureName: string }> = [
  { eventName: 'TokenCreate', signatureName: 'TokenCreate' },
  { eventName: 'TokenPurchase', signatureName: 'TokenPurchase' },
  { eventName: 'LiquidityAdded', signatureName: 'LiquidityAdded' },
  { eventName: 'PairCreated', signatureName: 'PairCreated' },
  { eventName: 'PoolCreated', signatureName: 'PoolCreated' },
];

function buildSubscriptionQuery(signatureName: string): string {
  return `subscription FourMeme${signatureName} {
  EVM(network: bsc) {
    Events(
      where: {
        Log: {
          SmartContract: {
            is: "${FOURMEME_TOKEN_MANAGER}"
          }
          Signature: { Name: { is: "${signatureName}" } }
        }
      }
    ) {
      Block { Time, Number }
      Transaction { Hash, From }
      Log { SmartContract }
      Arguments { Name, Value { ... on EVM_ABI_String_Value_Arg { string } ... on EVM_ABI_Address_Value_Arg { address } ... on EVM_ABI_Integer_Value_Arg { integer } } }
    }
  }
}`;
}

export class FourMemeIngester {
  private unsubscribers: Array<() => void> = [];
  private running = false;

  constructor(
    private bitqueryClient: BitqueryClient,
    private hotState: HotStateStore,
    private onEvent: (event: PerceptionEvent) => void
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const sub of SUBSCRIPTIONS) {
      const query = buildSubscriptionQuery(sub.signatureName);
      const unsubscribe = this.bitqueryClient.subscribeToEvents(
        query,
        (data: unknown) => {
          try {
            const wrapper = data as { EVM?: { Events?: unknown[] } };
            const events = wrapper?.EVM?.Events ?? [];
            for (const rawEvent of events) {
              const normalized = normalizeFourMemeEvent(rawEvent, sub.eventName);
              this.hotState.addEvent(normalized);
              this.onEvent(normalized);
            }
          } catch (err) {
            console.error(`[four-meme-ingester] Error normalizing ${sub.eventName}:`, err);
          }
        },
        (error: Error) => {
          console.error(`[four-meme-ingester] Subscription error for ${sub.eventName}:`, error.message);
        }
      );
      this.unsubscribers.push(unsubscribe);
    }

    console.log(`[four-meme-ingester] Started ${this.unsubscribers.length} subscriptions`);
  }

  stop(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.running = false;
    console.log('[four-meme-ingester] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }
}
