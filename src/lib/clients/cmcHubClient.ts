import { X402_COST_PER_CALL_USDC } from '@/config/perception';
import { ENABLE_X402_OUTBOUND } from '@/config/features';

const CMC_MCP_ENDPOINT = process.env.CMC_MCP_ENDPOINT ?? 'https://mcp.coinmarketcap.com/mcp';
const CMC_X402_ENDPOINT = process.env.CMC_X402_ENDPOINT ?? 'https://mcp.coinmarketcap.com/x402/mcp';

const MCP_PROTOCOL_VERSION = '2024-11-05';

const CMC_X402_MAX_USD_PER_CALL = Number(process.env.CMC_X402_MAX_USD_PER_CALL ?? '0.02');
// Base mainnet USDC; used to validate 402 payment requirements against tampering.
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_CHAIN_ID = 8453;

interface PaymentRequirement {
  scheme?: string;
  network?: string;
  chainId?: number;
  asset?: string;
  payTo?: string;
  maxAmountRequired?: string | number;
  validAfter?: number;
  validBefore?: number;
}

interface PaymentChallenge {
  accepts?: PaymentRequirement[];
}

/**
 * Validate a 402 payment requirement before signing. Defense against a tampered
 * server (or MITM) that swaps the recipient address or asks for an unbounded
 * amount. Returns null if safe to pay, or a reason string if it should be rejected.
 */
export function validatePaymentRequirement(req: PaymentRequirement): string | null {
  if (!req.scheme || req.scheme.toLowerCase() !== 'exact') {
    return `unsupported scheme ${req.scheme ?? '<none>'}`;
  }
  if (!req.network || req.network.toLowerCase() !== 'base') {
    return `unsupported network ${req.network ?? '<none>'}`;
  }
  if (req.chainId !== undefined && Number(req.chainId) !== BASE_CHAIN_ID) {
    return `unexpected chainId ${req.chainId} (need ${BASE_CHAIN_ID})`;
  }
  if (!req.asset || req.asset.toLowerCase() !== USDC_BASE_ADDRESS.toLowerCase()) {
    return `unexpected asset ${req.asset ?? '<none>'}`;
  }
  if (!req.payTo) return 'missing payTo';
  const maxAtomic = Number(req.maxAmountRequired ?? 0);
  if (!Number.isFinite(maxAtomic) || maxAtomic <= 0) return 'invalid maxAmountRequired';
  const capAtomic = Math.ceil(CMC_X402_MAX_USD_PER_CALL * 1_000_000);
  if (maxAtomic > capAtomic) {
    return `price $${(maxAtomic / 1_000_000).toFixed(4)} exceeds cap $${CMC_X402_MAX_USD_PER_CALL.toFixed(4)}`;
  }
  return null;
}

export type CmcTool =
  | 'get_crypto_quotes_latest'
  | 'search_cryptos'
  | 'get_crypto_info'
  | 'get_crypto_technical_analysis'
  | 'get_crypto_metrics'
  | 'get_global_metrics_latest'
  | 'get_global_crypto_derivatives_metrics'
  | 'trending_crypto_narratives'
  | 'get_upcoming_macro_events'
  | 'get_crypto_latest_news'
  | 'search_crypto_info'
  | 'get_crypto_marketcap_technical_analysis';

export interface CmcToolCallResult<T> {
  data: T;
  transport: 'mcp_free' | 'mcp_x402';
  rawCostUSDC: number;
  toolName: CmcTool;
  /**
   * Tx hash from the facilitator's X-Payment-Response header after a paid call
   * settles. Lets the operator audit every x402 payment from BscScan/Basescan
   * with no DB trust required. Present only on the x402 transport.
   */
  settlementTxHash: string | null;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | string;
  result?: { content: Array<{ type: string; text?: string }>; isError?: boolean } | T;
  error?: { code: number; message: string; data?: unknown };
}

function getCmcProKey(): string | null {
  return process.env.CMC_PRO_API_KEY ?? null;
}

let cmcX402PayHook: ((url: string, maxAtomic: bigint) => Promise<string>) | null = null;

/**
 * Inject the x402 payment callback. Called once at worker boot from the
 * agentLoop bootstrap path with `twakClient.payX402` as the implementation.
 * Module-level setter avoids a clients/cmcHubClient ↔ clients/twakClient
 * circular import.
 */
export function setCmcX402PayHook(
  hook: ((url: string, maxAtomic: bigint) => Promise<string>) | null,
): void {
  cmcX402PayHook = hook;
}

function getCmcX402Pay(): ((url: string, maxAtomic: bigint) => Promise<string>) | null {
  return cmcX402PayHook;
}

async function callMcp<T>(
  toolName: CmcTool,
  args: Record<string, unknown>,
  useX402Hint: boolean,
): Promise<CmcToolCallResult<T>> {
  const key = getCmcProKey();
  // Auto-pivot: when CMC_PRO_API_KEY is unset, route ALL calls via x402.
  // The 12-tool surface is identical on both endpoints; the agent pays
  // ~$0.01 USDC/call from its own x402 wallet via TWAK. This is the
  // hackathon-supported access path (no API-key signup required) and is
  // the stronger "Best Agent Hub" narrative: agent pays per query.
  const useX402 = useX402Hint || !key;
  const endpoint = useX402 ? CMC_X402_ENDPOINT : CMC_MCP_ENDPOINT;

  if (useX402 && !ENABLE_X402_OUTBOUND) {
    throw new Error(
      'callMcp: no CMC_PRO_API_KEY and ENABLE_X402_OUTBOUND=false. Cannot reach CMC. Set one of them.',
    );
  }
  if (useX402 && !getCmcX402Pay()) {
    throw new Error(
      'callMcp: x402 transport selected but no x402 pay hook registered. Did setCmcX402PayHook(twakClient.payX402) run at boot?',
    );
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
  };
  if (!useX402 && key) {
    baseHeaders['X-CMC-MCP-API-KEY'] = key;
  }

  const body = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  // Two-leg x402: send without X-Payment first; only sign + replay after we
  // see a 402 with payment requirements we trust. This is the spec-correct
  // flow and stops us from blindly paying a tampered recipient or a price
  // higher than CMC_X402_MAX_USD_PER_CALL.
  let response = await fetch(endpoint, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(body),
  });
  let settlementTxHash: string | null = null;

  if (useX402 && response.status === 402) {
    let challenge: PaymentChallenge;
    try {
      challenge = (await response.json()) as PaymentChallenge;
    } catch {
      throw new Error(`CMC MCP 402 with non-JSON body [tool=${toolName}]`);
    }
    const accepts = challenge.accepts ?? [];
    if (accepts.length === 0) {
      throw new Error(`CMC MCP 402 with empty accepts[] [tool=${toolName}]`);
    }
    const req =
      accepts.find(
        (r) => (r.scheme ?? '').toLowerCase() === 'exact' && (r.network ?? '').toLowerCase() === 'base',
      ) ?? accepts[0];
    const reject = validatePaymentRequirement(req);
    if (reject) {
      throw new Error(`CMC MCP 402 rejected [tool=${toolName}]: ${reject}`);
    }
    const payHook = getCmcX402Pay()!;
    const maxAtomic = BigInt(Math.ceil(Number(req.maxAmountRequired ?? 0)));
    const proof = await payHook(endpoint, maxAtomic);
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...baseHeaders, 'X-Payment': proof },
      body: JSON.stringify(body),
    });
    settlementTxHash =
      response.headers.get('X-Payment-Response') ??
      response.headers.get('x-payment-response') ??
      null;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `CMC MCP call failed [tool=${toolName} transport=${useX402 ? 'x402' : 'mcp_free'} status=${response.status}]: ${errorBody}`,
    );
  }

  const json = (await response.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(`CMC MCP error [tool=${toolName}]: ${json.error.message}`);
  }

  // MCP `tools/call` results come back wrapped in { content: [{ type: 'text', text: '<json>' }] }.
  let parsed: T;
  const result = json.result as
    | { content?: Array<{ type: string; text?: string }>; isError?: boolean }
    | undefined;
  if (result && Array.isArray(result.content) && result.content.length > 0) {
    if (result.isError) {
      const errText = result.content
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)
        .join('');
      throw new Error(`CMC MCP tool isError [tool=${toolName}]: ${errText}`);
    }
    const textBlocks = result.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');
    try {
      parsed = JSON.parse(textBlocks) as T;
    } catch {
      // The tool may already return text preserve raw.
      parsed = textBlocks as unknown as T;
    }
  } else {
    parsed = json.result as T;
  }

  return {
    data: parsed,
    transport: useX402 ? 'mcp_x402' : 'mcp_free',
    rawCostUSDC: useX402 ? X402_COST_PER_CALL_USDC : 0,
    toolName,
    settlementTxHash,
  };
}

export class CmcHubClient {
  async getCryptoQuotes(args: { symbols?: string[]; ids?: string[]; convert?: string }): Promise<
    CmcToolCallResult<unknown>
  > {
    return callMcp('get_crypto_quotes_latest', args, false);
  }

  async searchCryptos(args: { query: string; limit?: number }): Promise<CmcToolCallResult<unknown>> {
    return callMcp('search_cryptos', args, false);
  }

  async getCryptoInfo(args: { symbol?: string; id?: string }): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_crypto_info', args, false);
  }

  async getCryptoMetrics(args: { symbol?: string; id?: string }): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_crypto_metrics', args, false);
  }

  async getGlobalMetrics(): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_global_metrics_latest', {}, false);
  }

  async getDerivativesMetrics(): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_global_crypto_derivatives_metrics', {}, false);
  }

  async getTrendingNarratives(args: { limit?: number } = {}): Promise<CmcToolCallResult<unknown>> {
    return callMcp('trending_crypto_narratives', args, false);
  }

  async getUpcomingMacroEvents(): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_upcoming_macro_events', {}, false);
  }

  async getLatestNews(args: { limit?: number } = {}): Promise<CmcToolCallResult<unknown>> {
    return callMcp('get_crypto_latest_news', args, false);
  }

  async getTechnicalAnalysis(args: { symbol?: string; id?: string; interval?: string }): Promise<
    CmcToolCallResult<unknown>
  > {
    return callMcp('get_crypto_technical_analysis', args, false);
  }

  /**
   * Force the x402 transport for a single tool call. Use when the free MCP quota
   * is exhausted or when the EV gate has approved spending 0.01 USDC for premium data.
   * Callers must ensure the agent's x402 settlement wallet has enough USDC on Base.
   */
  async callX402<T>(toolName: CmcTool, args: Record<string, unknown>): Promise<CmcToolCallResult<T>> {
    return callMcp<T>(toolName, args, true);
  }
}

export const cmcHubClient = new CmcHubClient();
