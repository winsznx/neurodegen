import { X402_COST_PER_CALL_USDC } from '@/config/perception';
import { ENABLE_X402_OUTBOUND } from '@/config/features';

const CMC_MCP_ENDPOINT = process.env.CMC_MCP_ENDPOINT ?? 'https://mcp.coinmarketcap.com/mcp';
const CMC_X402_ENDPOINT = process.env.CMC_X402_ENDPOINT ?? 'https://mcp.coinmarketcap.com/x402/mcp';

const MCP_PROTOCOL_VERSION = '2024-11-05';

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

function getCmcX402Pay(): ((url: string, maxAtomic: bigint) => Promise<string>) | null {
  // The actual x402 settlement runs through twakClient.payX402. We expose this as
  // a hook so the perception layer can inject the payX402 callback at the call site
  // without creating a circular import from clients/twakClient → clients/cmcHubClient.
  return null;
}

async function callMcp<T>(
  toolName: CmcTool,
  args: Record<string, unknown>,
  useX402: boolean,
): Promise<CmcToolCallResult<T>> {
  const endpoint = useX402 ? CMC_X402_ENDPOINT : CMC_MCP_ENDPOINT;
  const key = getCmcProKey();

  if (!useX402 && !key) {
    throw new Error(
      'callMcp: CMC_PRO_API_KEY not set and useX402=false. Set the key or pass useX402=true.',
    );
  }
  if (useX402 && !ENABLE_X402_OUTBOUND) {
    throw new Error(
      'callMcp: ENABLE_X402_OUTBOUND=false. Cannot use the x402 transport.',
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
  };
  if (!useX402 && key) {
    headers['X-CMC-MCP-API-KEY'] = key;
  }

  if (useX402) {
    const payHook = getCmcX402Pay();
    if (payHook) {
      const maxAtomic = BigInt(Math.ceil(X402_COST_PER_CALL_USDC * 1_000_000));
      const proof = await payHook(endpoint, maxAtomic);
      headers['X-Payment'] = proof;
    }
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

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
      // The tool may already return text — preserve raw.
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
