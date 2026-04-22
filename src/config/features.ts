function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw.toLowerCase() === 'true';
}

// All runtime-tunable. Set on the Railway worker service (for execution/attestation)
// and/or the Vercel web service where relevant. Changing any of these is a restart,
// not a redeploy — flip the value in Railway Variables → click Redeploy, done.

// Hard off by default. Flip to true on the Railway worker env only when you're ready for real MYX orders.
export const ENABLE_EXECUTION: boolean = envBool('ENABLE_EXECUTION', false);

// On-chain attestation contract emission. On by default.
export const ENABLE_ATTESTATION: boolean = envBool('ENABLE_ATTESTATION', true);

// Pieverse skill webhook path. On by default.
export const ENABLE_PIEVERSE_SKILL: boolean = envBool('ENABLE_PIEVERSE_SKILL', true);

// BYOK (your own OpenAI/Anthropic keys) routing. Off by default so sponsor DGrid
// credits carry the load and your paid keys only fire if explicitly enabled AND DGrid fails.
export const ENABLE_BYOK_ROUTING: boolean = envBool('ENABLE_BYOK_ROUTING', false);
// When true, funded BYOK routes are tried before DGrid. Useful when DGrid quota is exhausted.
export const PREFER_BYOK_ROUTING: boolean = envBool('PREFER_BYOK_ROUTING', false);
// When true, skip DGrid entirely and use only funded BYOK / degraded fallbacks.
export const DISABLE_DGRID_ROUTING: boolean = envBool('DISABLE_DGRID_ROUTING', false);

// Gemini third format path. Off by default.
export const ENABLE_GEMINI_FORMAT: boolean = envBool('ENABLE_GEMINI_FORMAT', false);

// When true the transaction submitter returns a synthetic tx hash instead of signing.
// Flip to false on Railway worker (together with ENABLE_EXECUTION=true) to send real orders.
export const DRY_RUN_MODE: boolean = envBool('DRY_RUN_MODE', true);
