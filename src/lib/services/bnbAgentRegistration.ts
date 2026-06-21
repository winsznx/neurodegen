import { ERC8004_REGISTRY_ADDRESS } from '@/config/chains';
import { DRY_RUN_MODE, ENABLE_ERC8004_REGISTRATION } from '@/config/features';
import { twakClient } from '@/lib/clients/twakClient';
import { getWorkerState, setWorkerState } from '@/lib/queries/workerState';

export const ERC8004_REGISTRATION_KEY = 'bnb_erc8004_registration_v1';

export interface PersistedErc8004Registration {
  registered: true;
  agentId: string;
  txHash: `0x${string}`;
  registry: `0x${string}`;
  uri: string;
  registeredAt: string;
  alreadyRegistered: boolean;
  dryRun: boolean;
}

export type EnsureErc8004Result =
  | { ok: true; reason: 'cached' | 'fresh'; record: PersistedErc8004Registration }
  | { ok: false; reason: 'disabled' | 'dry_run_skipped' | 'twak_failed'; message: string };

/**
 * Generate the ERC-8004 agent-card JSON. Inlined as a `data:application/json;base64,…`
 * URI - the canonical format the bnbagent-sdk uses. No IPFS dependency.
 *
 * The card surfaces the running NeuroDegen instance: name, public description,
 * and the service endpoint(s) that other agents could call (the public web URL).
 * It is on-chain provable that this agent identity is owned by the agent's
 * TWAK wallet - the on-chain `Registered(uint256 indexed agentId, string
 * agentURI, address indexed owner)` event embeds both.
 */
export function buildAgentCardJson(args: {
  name: string;
  description: string;
  webUrl: string;
  agentWallet: `0x${string}`;
  chainId: number;
}): string {
  const card = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: args.name,
    description: args.description,
    services: [
      {
        name: 'web',
        endpoint: args.webUrl,
        version: '1.0.0',
      },
      {
        name: 'proof',
        endpoint: `${args.webUrl.replace(/\/$/, '')}/proof`,
        version: '1.0.0',
      },
    ],
    registrations: [],
    supportedTrust: [
      'erc-8004-identity',
      'erc-8183-commerce',
      'neurodegen-attestation-commit-reveal',
    ],
  };
  return JSON.stringify(card);
}

export function buildAgentCardUri(cardJson: string): string {
  const b64 = Buffer.from(cardJson, 'utf8').toString('base64');
  return `data:application/json;base64,${b64}`;
}

/**
 * Idempotently register the agent on the ERC-8004 identity registry.
 *
 * Caches the result in `worker_state`. Skips when `ENABLE_ERC8004_REGISTRATION`
 * is false. Skips in DRY_RUN_MODE because the registry call is synthetic and
 * would never be accepted as on-chain proof.
 *
 * Unlike competition registration, ERC-8004 has no deadline - we can register
 * any time. Failures log loudly but never crash the worker.
 */
export async function ensureErc8004Registration(args: {
  name?: string;
  description?: string;
  webUrl?: string;
  agentWallet?: `0x${string}`;
  now?: Date;
}): Promise<EnsureErc8004Result> {
  const now = args.now ?? new Date();

  if (!ENABLE_ERC8004_REGISTRATION) {
    return {
      ok: false,
      reason: 'disabled',
      message: 'ENABLE_ERC8004_REGISTRATION=false',
    };
  }

  const cached = await getWorkerState<PersistedErc8004Registration>(
    ERC8004_REGISTRATION_KEY,
  ).catch(() => null);
  if (cached?.registered) {
    return { ok: true, reason: 'cached', record: cached };
  }

  if (DRY_RUN_MODE) {
    return {
      ok: false,
      reason: 'dry_run_skipped',
      message:
        'DRY_RUN_MODE=true - skipping on-chain ERC-8004 registration. Flip off before deploy to publish identity.',
    };
  }

  const name = args.name ?? 'NeuroDegen V2';
  const description =
    args.description ??
    'Autonomous investment-committee trading agent on BNB Chain. Three-LLM committee (narrative, quant, risk), TWAK-only execution, commit-reveal attestation. Composition over alpha.';
  const webUrl = args.webUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://neurodegen.xyz';
  const agentWallet =
    args.agentWallet ??
    (process.env.TWAK_AGENT_WALLET_ADDRESS as `0x${string}` | undefined) ??
    ('0x0000000000000000000000000000000000000000' as `0x${string}`);

  const cardJson = buildAgentCardJson({
    name,
    description,
    webUrl,
    agentWallet,
    chainId: 56,
  });
  const uri = buildAgentCardUri(cardJson);

  try {
    const res = await twakClient.erc8004Register({ uri });
    const record: PersistedErc8004Registration = {
      registered: true,
      agentId: res.agentId,
      txHash: res.txHash,
      registry: ERC8004_REGISTRY_ADDRESS,
      uri,
      registeredAt: now.toISOString(),
      alreadyRegistered: res.alreadyRegistered,
      dryRun: false,
    };
    await setWorkerState(ERC8004_REGISTRATION_KEY, record);
    return { ok: true, reason: 'fresh', record };
  } catch (err) {
    return {
      ok: false,
      reason: 'twak_failed',
      message: `twak erc8004 register failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
