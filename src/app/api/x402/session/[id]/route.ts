import { NextResponse } from 'next/server';
import { decodeEventLog, getAddress, parseAbiItem } from 'viem';
import { publicClient } from '@/lib/clients/chain';
import { getSessionById } from '@/lib/queries/sessions';
import { recordProof } from '@/lib/queries/x402proofs';
import {
  X402_INBOUND_PRICE_USDT_ATOMIC,
  X402_INBOUND_PRICE_USDT_HUMAN,
  X402_REVENUE_ADDRESS,
} from '@/config/monetization';
import { BSC_USDT_ADDRESS } from '@/config/chains';
import { ENABLE_X402_INBOUND } from '@/config/features';

// V2 Phase 2 audit fix: normalize the configured revenue address once via
// getAddress(). Without this, a lowercase env var silently fails the
// case-sensitive equality compare against the Transfer event's checksummed
// `to`. Throws at module load if the env value is malformed.
const NORMALIZED_REVENUE_ADDRESS: `0x${string}` | null = X402_REVENUE_ADDRESS
  ? getAddress(X402_REVENUE_ADDRESS)
  : null;

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

function challenge(endpoint: string) {
  return NextResponse.json(
    {
      error: 'Payment required',
      paymentRequired: true,
      protocol: 'x402',
      amount: X402_INBOUND_PRICE_USDT_HUMAN,
      amountAtomic: X402_INBOUND_PRICE_USDT_ATOMIC,
      token: 'USDT',
      tokenAddress: BSC_USDT_ADDRESS,
      recipient: NORMALIZED_REVENUE_ADDRESS,
      chainId: 56,
      endpoint,
    },
    {
      status: 402,
      headers: {
        'X-Payment-Protocol': 'x402',
        'X-Payment-Amount': X402_INBOUND_PRICE_USDT_HUMAN,
        'X-Payment-Amount-Atomic': X402_INBOUND_PRICE_USDT_ATOMIC,
        'X-Payment-Token': BSC_USDT_ADDRESS,
        'X-Payment-Recipient':
          NORMALIZED_REVENUE_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        'X-Payment-Chain-Id': '56',
      },
    },
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!ENABLE_X402_INBOUND) {
    return NextResponse.json({ error: 'inbound x402 disabled' }, { status: 503 });
  }
  if (!NORMALIZED_REVENUE_ADDRESS) {
    return NextResponse.json({ error: 'X402_REVENUE_ADDRESS not configured' }, { status: 503 });
  }

  const { id } = await context.params;
  const endpoint = `/api/x402/session/${id}`;
  const proof = request.headers.get('X-Payment-Proof');
  if (!proof) return challenge(endpoint);
  if (!/^0x[a-fA-F0-9]{64}$/.test(proof)) {
    return NextResponse.json({ error: 'X-Payment-Proof must be a 32-byte tx hash' }, { status: 400 });
  }
  const proofHash = proof as `0x${string}`;

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: proofHash });
  } catch (err) {
    return NextResponse.json(
      { error: `tx ${proofHash} not found`, detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  if (receipt.status !== 'success') {
    return NextResponse.json({ error: `tx ${proofHash} reverted` }, { status: 400 });
  }

  const expectedMin = BigInt(X402_INBOUND_PRICE_USDT_ATOMIC);
  let payer: `0x${string}` | null = null;
  let paid = 0n;

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== BSC_USDT_ADDRESS) continue;
    try {
      const decoded = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics });
      if (decoded.eventName !== 'Transfer') continue;
      const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
      if (getAddress(args.to) !== NORMALIZED_REVENUE_ADDRESS) continue;
      if (args.value >= expectedMin) {
        payer = args.from;
        paid = args.value;
        break;
      }
    } catch {
      // not a Transfer log; ignore
    }
  }

  if (!payer) {
    return NextResponse.json(
      { error: 'no matching USDT Transfer to recipient in tx logs' },
      { status: 400 },
    );
  }

  // V2 Phase 2 audit fix [NEW-D2]: atomic insert-or-409. The insert IS the
  // check; no TOCTOU window for concurrent requests to both pass `isConsumed`
  // and then both spend the same proof.
  const recordResult = await recordProof({
    txHash: proofHash,
    payer,
    amountAtomic: paid.toString(),
    endpoint,
  });
  if (recordResult.replay) {
    return NextResponse.json({ error: 'proof already consumed' }, { status: 409 });
  }

  const session = await getSessionById(id);
  if (!session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}
