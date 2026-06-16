// Inbound x402 pricing for the public session API.
// Default settlement: BSC USDT at 0.01 (6 decimals). Base USDC supported by the x402 client.

export const X402_INBOUND_PRICE_USDT_ATOMIC: string = process.env.X402_INBOUND_PRICE_USDT_ATOMIC ?? '10000'; // 0.01 USDT (6 decimals)
export const X402_INBOUND_PRICE_USDT_HUMAN: string = process.env.X402_INBOUND_PRICE_USDT_HUMAN ?? '0.01';
export const X402_INBOUND_TOKEN_SYMBOL: string = 'USDT';
export const X402_INBOUND_NETWORK: 'bsc' | 'base' = 'bsc';

// Revenue address — receives inbound x402 settlements. Set per-deploy; required in prod for
// the inbound endpoint to function. Empty string in dev short-circuits to a 503.
export const X402_REVENUE_ADDRESS: `0x${string}` | '' =
  (process.env.X402_REVENUE_ADDRESS as `0x${string}` | undefined) ?? '';
