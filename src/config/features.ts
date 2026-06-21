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

// DGrid is the primary reasoning gateway for V2: every committee cycle routes
// narrative + quant + risk through DGrid first, with BYOK Anthropic/OpenAI as
// a fallback ONLY when those env vars are set. The risk classifier (DeepSeek
// v3.2) has no BYOK path and always uses DGrid. Flip PREFER_BYOK_ROUTING=true
// at the env layer to invert (e.g. if DGrid quota is exhausted mid-window).
export const ENABLE_BYOK_ROUTING: boolean = envBool('ENABLE_BYOK_ROUTING', true);
export const PREFER_BYOK_ROUTING: boolean = envBool('PREFER_BYOK_ROUTING', false);
export const DISABLE_DGRID_ROUTING: boolean = envBool('DISABLE_DGRID_ROUTING', false);

// Probe-trade compliance fallback. On by default. Defenders against quiet markets.
export const ENABLE_PROBE_TRADE: boolean = envBool('ENABLE_PROBE_TRADE', true);

// BNB AI Agent SDK integration ERC-8004 identity registration runs at boot,
// idempotent. Default ON (the registration is harmless when DRY_RUN_MODE=true
// since twak returns a synthetic agentId).
export const ENABLE_ERC8004_REGISTRATION: boolean = envBool('ENABLE_ERC8004_REGISTRATION', true);

// ERC-8183 agentic-commerce job lifecycle per committee decision. Default OFF
// because each job requires a tiny U-token balance for funding. Operator flips
// on after funding the agent wallet with U.
export const ENABLE_ERC8183_JOBS: boolean = envBool('ENABLE_ERC8183_JOBS', false);

// Per-job budget (in U-token wei). 0.01 U at 18 decimals = 10^16. Small enough
// that a 1 U starting balance funds 100 jobs.
export const ERC8183_JOB_BUDGET_WEI: string =
  process.env.ERC8183_JOB_BUDGET_WEI ?? '10000000000000000';

// V2.1 deferrals all default OFF, flip true to ship the feature in a V2.1 release branch.
export const ENABLE_PERP_MODE: boolean = envBool('ENABLE_PERP_MODE', false);
// Operator alerts via Telegram Bot API (outbound-only). Defaults true: the
// alerter is a no-op unless TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are also set,
// so flipping the default is safe empty env leaves the feature dormant.
export const ENABLE_TELEGRAM_ALERTS: boolean = envBool('ENABLE_TELEGRAM_ALERTS', true);
export const ENABLE_NLP_MANDATE_PARSER: boolean = envBool('ENABLE_NLP_MANDATE_PARSER', false);

// Dry-run: when true, twakClient.executeSwap returns a synthetic tx hash instead of shelling out.
// Pair with ENABLE_EXECUTION=true to do paper trading; flip to false for live trades.
export const DRY_RUN_MODE: boolean = envBool('DRY_RUN_MODE', true);
