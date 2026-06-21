/**
 * Pull recent on-chain activity for the agent wallet from BscScan v2 API.
 *
 * Used by /journal and / to render real on-chain trades when the DB-backed
 * committee_sessions table is empty (regime stays quiet → cognition
 * suppressed → no sessions → empty journal even though the agent has real
 * probe trades on chain).
 *
 * Free tier: 5 req/sec, no API key required. We cache aggressively via the
 * Next route's `revalidate` so a public landing page can't burn the quota.
 */

const BSCSCAN_API = 'https://api.bscscan.com/api';

interface BscScanTokenTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
  gas: string;
  gasUsed: string;
  gasPrice: string;
}

interface BscScanResponse<T> {
  status: '0' | '1';
  message: string;
  result: T[] | string;
}

export interface OnChainSwap {
  hash: `0x${string}`;
  blockNumber: number;
  timestamp: number;
  /** Token sent (debited from agent wallet). */
  sent: { symbol: string; amount: number; contract: `0x${string}` } | null;
  /** Token received (credited to agent wallet). */
  received: { symbol: string; amount: number; contract: `0x${string}` } | null;
  /** True when this looks like a probe round-trip leg (stable <-> known token). */
  probable: 'forward' | 'reverse' | 'oneway';
}

/**
 * Read the agent wallet's BEP-20 token transfer history, group by tx hash,
 * and return a list of swaps with sent + received tokens identified.
 */
export async function fetchAgentSwaps(
  agentAddress: `0x${string}`,
  options: { limit?: number; apiKey?: string } = {},
): Promise<OnChainSwap[]> {
  const limit = options.limit ?? 25;
  const key = options.apiKey ?? process.env.BSCSCAN_API_KEY ?? '';

  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address: agentAddress,
    sort: 'desc',
    page: '1',
    offset: String(Math.min(limit * 4, 200)), // each swap = ~2 transfers; over-fetch
  });
  if (key) params.set('apikey', key);

  const res = await fetch(`${BSCSCAN_API}?${params.toString()}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as BscScanResponse<BscScanTokenTx>;
  if (json.status !== '1' || !Array.isArray(json.result)) return [];

  // Group transfers by tx hash. A swap is a tx where ONE token is sent FROM
  // the agent and a DIFFERENT token is received TO the agent (within the same
  // tx). One-sided transfers (deposits, withdrawals, approvals) are filtered.
  const byTx = new Map<string, BscScanTokenTx[]>();
  for (const t of json.result) {
    const list = byTx.get(t.hash) ?? [];
    list.push(t);
    byTx.set(t.hash, list);
  }

  const lowerAgent = agentAddress.toLowerCase();
  const swaps: OnChainSwap[] = [];

  for (const [hash, transfers] of byTx) {
    let sent: OnChainSwap['sent'] = null;
    let received: OnChainSwap['received'] = null;
    let blockNumber = 0;
    let timestamp = 0;

    for (const t of transfers) {
      blockNumber = Number.parseInt(t.blockNumber, 10);
      timestamp = Number.parseInt(t.timeStamp, 10) * 1000;
      const decimals = Number.parseInt(t.tokenDecimal, 10) || 18;
      const amount = Number.parseFloat(t.value) / 10 ** decimals;
      const fromAgent = t.from.toLowerCase() === lowerAgent;
      const toAgent = t.to.toLowerCase() === lowerAgent;
      if (fromAgent && !toAgent) {
        sent = { symbol: t.tokenSymbol, amount, contract: t.contractAddress as `0x${string}` };
      } else if (toAgent && !fromAgent) {
        received = {
          symbol: t.tokenSymbol,
          amount,
          contract: t.contractAddress as `0x${string}`,
        };
      }
    }

    // Must be a real swap: agent sent ONE token and received ANOTHER.
    if (!sent || !received || sent.contract.toLowerCase() === received.contract.toLowerCase()) {
      continue;
    }

    // Heuristic: forward leg = stable→volatile, reverse = volatile→stable.
    const STABLE = /^(USDT|USDC|BUSD|DAI|FDUSD|TUSD|FRAX|USDD|USDE|USD1|USDF)$/i;
    const sentStable = STABLE.test(sent.symbol);
    const recvStable = STABLE.test(received.symbol);
    let probable: OnChainSwap['probable'] = 'oneway';
    if (sentStable && !recvStable) probable = 'forward';
    else if (!sentStable && recvStable) probable = 'reverse';
    else if (sentStable && recvStable) probable = 'oneway'; // stable round-trip

    swaps.push({
      hash: hash as `0x${string}`,
      blockNumber,
      timestamp,
      sent,
      received,
      probable,
    });
  }

  // Newest first.
  swaps.sort((a, b) => b.timestamp - a.timestamp);
  return swaps.slice(0, limit);
}
