function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true';
}

// Master kill: when false the worker boots, ingests, deliberates, but never submits a swap or attestation.
export const ENABLE_EXECUTION: boolean = envBool('ENABLE_EXECUTION', false);

// On-chain attestation contract emission. On by default so the reasoning hash + reveal land on BSC.
export const ENABLE_ATTESTATION: boolean = envBool('ENABLE_ATTESTATION', true);

// Inbound x402 gating on /api/x402/* routes. On by default.
export const ENABLE_X402_INBOUND: boolean = envBool('ENABLE_X402_INBOUND', true);

// Outbound x402 transport for CMC premium tools. Off by default; the EV gate enables it dynamically
// per call when projected alpha justifies the spend.
export const ENABLE_X402_OUTBOUND: boolean = envBool('ENABLE_X402_OUTBOUND', true);

// BYOK direct Anthropic + OpenAI before DGrid fallback. On by default; flips to off lets DGrid
// carry the load and saves BYOK credits.
export const ENABLE_BYOK_ROUTING: boolean = envBool('ENABLE_BYOK_ROUTING', true);
export const PREFER_BYOK_ROUTING: boolean = envBool('PREFER_BYOK_ROUTING', true);
export const DISABLE_DGRID_ROUTING: boolean = envBool('DISABLE_DGRID_ROUTING', false);

// Probe-trade compliance fallback. On by default. Defenders against quiet markets.
export const ENABLE_PROBE_TRADE: boolean = envBool('ENABLE_PROBE_TRADE', true);

// V2.1 deferrals — all default OFF, flip true to ship the feature in a V2.1 release branch.
export const ENABLE_PERP_MODE: boolean = envBool('ENABLE_PERP_MODE', false);
export const ENABLE_TELEGRAM_ALERTS: boolean = envBool('ENABLE_TELEGRAM_ALERTS', false);
export const ENABLE_NLP_MANDATE_PARSER: boolean = envBool('ENABLE_NLP_MANDATE_PARSER', false);

// Dry-run: when true, twakClient.executeSwap returns a synthetic tx hash instead of shelling out.
// Pair with ENABLE_EXECUTION=true to do paper trading; flip to false for live trades.
export const DRY_RUN_MODE: boolean = envBool('DRY_RUN_MODE', true);
