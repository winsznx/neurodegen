import { parseAbiItem, decodeEventLog, getAddress } from 'viem';
import { publicClient } from '@/lib/clients/chain';
import { MONITOR_PRICE_PIEUSD_PER_HOUR } from '@/config/monetization';

const PIEUSD_DEFAULT_ADDRESS = '0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9' as const;
const PIEUSD_DECIMALS = 6n;
const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

function pieUsdAddress(): `0x${string}` {
  const raw = process.env.PIEVERSE_PIEUSD_ADDRESS ?? PIEUSD_DEFAULT_ADDRESS;
  return getAddress(raw) as `0x${string}`;
}

function revenueAddress(): `0x${string}` | null {
  const raw = process.env.PIEVERSE_REVENUE_ADDRESS;
  if (!raw) return null;
  return getAddress(raw) as `0x${string}`;
}

function priceToSmallestUnit(decimal: string): bigint {
  const [whole, fraction = ''] = decimal.split('.');
  const padded = (fraction + '0'.repeat(Number(PIEUSD_DECIMALS))).slice(0, Number(PIEUSD_DECIMALS));
  return BigInt(whole) * 10n ** PIEUSD_DECIMALS + BigInt(padded || '0');
}

export interface PaymentChallenge {
  status: 402;
  headers: Record<string, string>;
  body: {
    error: string;
    paymentRequired: true;
    protocol: 'x402';
    amount: string;
    amountSmallestUnit: string;
    token: 'pieUSD';
    tokenAddress: `0x${string}`;
    recipient: `0x${string}` | null;
    chainId: 56;
  };
}

export interface PaymentVerification {
  valid: boolean;
  reason: string;
  amountPaid?: bigint;
  payer?: `0x${string}`;
  txHash?: `0x${string}`;
}

export class PaymentHandler {
  buildChallenge(command: string): PaymentChallenge {
    const recipient = revenueAddress();
    const tokenAddress = pieUsdAddress();
    const amountSmallestUnit = priceToSmallestUnit(MONITOR_PRICE_PIEUSD_PER_HOUR);

    return {
      status: 402,
      headers: {
        'X-Payment-Protocol': 'x402',
        'X-Payment-Amount': MONITOR_PRICE_PIEUSD_PER_HOUR,
        'X-Payment-Amount-Smallest-Unit': amountSmallestUnit.toString(),
        'X-Payment-Token': tokenAddress,
        'X-Payment-Token-Symbol': 'pieUSD',
        'X-Payment-Recipient': recipient ?? '0x0000000000000000000000000000000000000000',
        'X-Payment-Chain-Id': '56',
      },
      body: {
        error: `Payment required for command: ${command}`,
        paymentRequired: true,
        protocol: 'x402',
        amount: MONITOR_PRICE_PIEUSD_PER_HOUR,
        amountSmallestUnit: amountSmallestUnit.toString(),
        token: 'pieUSD',
        tokenAddress,
        recipient,
        chainId: 56,
      },
    };
  }

  async verifyPayment(txHash: string): Promise<PaymentVerification> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return { valid: false, reason: 'payment proof must be a 32-byte tx hash' };
    }
    const recipient = revenueAddress();
    if (!recipient) {
      return { valid: false, reason: 'PIEVERSE_REVENUE_ADDRESS not configured' };
    }

    const expectedMin = priceToSmallestUnit(MONITOR_PRICE_PIEUSD_PER_HOUR);
    const tokenAddress = pieUsdAddress();

    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== 'success') {
        return { valid: false, reason: `tx ${txHash} reverted` };
      }

      for (const log of receipt.logs) {
        if (getAddress(log.address) !== tokenAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [TRANSFER_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName !== 'Transfer') continue;
          const args = decoded.args as { from: `0x${string}`; to: `0x${string}`; value: bigint };
          if (getAddress(args.to) !== recipient) continue;
          if (args.value < expectedMin) {
            return {
              valid: false,
              reason: `pieUSD amount ${args.value} below required ${expectedMin}`,
            };
          }
          return {
            valid: true,
            reason: 'ok',
            amountPaid: args.value,
            payer: args.from,
            txHash: txHash as `0x${string}`,
          };
        } catch {
          // not a Transfer log; skip
        }
      }

      return { valid: false, reason: 'no matching pieUSD Transfer to recipient in tx logs' };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
