import { NextResponse } from 'next/server';
import { COMPETITION_CONTRACT_ADDRESS } from '@/config/competition';
import { ATTESTATION_CONTRACT_ADDRESS, ERC8004_REGISTRY_ADDRESS, ERC8183_COMMERCE_ADDRESS } from '@/config/chains';

export const dynamic = 'force-dynamic';

/**
 * ERC-8004 agent card.
 *
 * Resolved when an indexer or another agent fetches the `agentURI` recorded
 * by the ERC-8004 Identity Registry on BSC mainnet at
 * 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432. Returns a JSON document
 * matching the registration-v1 type defined by EIP-8004 and exposes every
 * downstream service (A2A endpoint, attestation rail, agentic commerce,
 * proof page) so a third-party can discover and verify the agent end to end.
 *
 * Schema: https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */
export async function GET(): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://neurodegen.xyz';
  const ownerAddress = process.env.TWAK_AGENT_WALLET_ADDRESS ?? '0x1a59eD9BB4890a8ac02746BFC00EDeCBBBe375fF';

  const body = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'NeuroDegen V2',
    description:
      'An autonomous on-chain investment committee for BNB Chain. Three single-purpose LLMs (narrative, quant, risk) deliberate over CoinMarketCap signal data and produce a structured trading action. Trust Wallet Agent Kit signs every trade with self-custody preserved. Every decision is committed to BSC before execution and revealed after confirmation.',
    image: `${appUrl}/opengraph-image`,
    services: [
      {
        name: 'A2A',
        endpoint: appUrl,
        version: '0.3.0',
      },
      {
        name: 'proof-page',
        endpoint: `${appUrl}/proof/{twakTxHash}`,
        version: '1.0.0',
      },
      {
        name: 'session-journal',
        endpoint: `${appUrl}/journal`,
        version: '1.0.0',
      },
      {
        name: 'live-committee',
        endpoint: `${appUrl}/agent`,
        version: '1.0.0',
      },
      {
        name: 'health',
        endpoint: `${appUrl}/api/health`,
        version: '1.0.0',
      },
      {
        name: 'session-api',
        endpoint: `${appUrl}/api/session/{sessionId}`,
        version: '1.0.0',
      },
      {
        name: 'x402-session-paid',
        endpoint: `${appUrl}/api/x402/session/{sessionId}`,
        version: '1.0.0',
      },
      {
        name: 'sse-event-stream',
        endpoint: `${appUrl}/api/events/stream`,
        version: '1.0.0',
      },
      {
        name: 'telegram-status-channel',
        endpoint: 'https://t.me/neurodegenv2',
        version: '1.0.0',
      },
    ],
    registrations: [
      {
        agentRegistry: `eip155:56:${ERC8004_REGISTRY_ADDRESS}`,
        owner: ownerAddress,
      },
    ],
    supportedTrust: [
      'erc-8004-identity',
      'erc-8183-commerce',
      'neurodegen-attestation-commit-reveal',
    ],
    contracts: {
      bsc: {
        chainId: 56,
        attestationEmitter: ATTESTATION_CONTRACT_ADDRESS,
        competitionContract: COMPETITION_CONTRACT_ADDRESS,
        erc8004Registry: ERC8004_REGISTRY_ADDRESS,
        erc8183Commerce: ERC8183_COMMERCE_ADDRESS,
      },
    },
    repository: 'https://github.com/winsznx/neurodegen',
    license: 'AGPL-3.0-only',
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
