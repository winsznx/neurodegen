import { keccak256, toBytes, pad, toHex } from 'viem';
import { ENABLE_ATTESTATION } from '@/config/features';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { attestationEmitterAbi } from '@/lib/abis/attestationEmitter';
import { getAgentWalletClient, publicClient, bscChain } from '@/lib/clients/chain';
import type { RegimeLabel } from '@/types/cognition';

function toBytes32FromUuid(uuid: string): `0x${string}` {
  return keccak256(toBytes(uuid));
}

function regimeToBytes32(regime: RegimeLabel): `0x${string}` {
  return pad(toHex(regime), { size: 32 });
}

function getContractAddress(): `0x${string}` | null {
  if (!ATTESTATION_CONTRACT_ADDRESS) return null;
  return ATTESTATION_CONTRACT_ADDRESS as `0x${string}`;
}

export class AttestationEmitter {
  async attestPositionOpen(
    reasoningGraphId: string,
    pairIndex: number,
    isLong: boolean,
    sizeAmount: bigint
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) {
      console.log('[attestation] Attestation disabled');
      return null;
    }

    const address = getContractAddress();
    if (!address) {
      console.log('[attestation] Attestation contract not deployed');
      return null;
    }

    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address,
        abi: attestationEmitterAbi,
        functionName: 'attestPositionOpen',
        args: [
          toBytes32FromUuid(reasoningGraphId),
          BigInt(pairIndex),
          isLong,
          sizeAmount,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error('[attestation] Position open attestation failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async attestPositionClose(
    reasoningGraphId: string,
    pairIndex: number,
    isLong: boolean,
    realizedPnl: bigint
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;

    const address = getContractAddress();
    if (!address) return null;

    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address,
        abi: attestationEmitterAbi,
        functionName: 'attestPositionClose',
        args: [
          toBytes32FromUuid(reasoningGraphId),
          BigInt(pairIndex),
          isLong,
          realizedPnl,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error('[attestation] Position close attestation failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async attestRegimeChange(
    fromRegime: RegimeLabel,
    toRegime: RegimeLabel
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;

    const address = getContractAddress();
    if (!address) return null;

    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address,
        abi: attestationEmitterAbi,
        functionName: 'attestRegimeChange',
        args: [regimeToBytes32(fromRegime), regimeToBytes32(toRegime)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error('[attestation] Regime change attestation failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async commitReasoning(
    reasoningHash: `0x${string}`,
    actionIntent: `0x${string}`
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    const address = getContractAddress();
    if (!address) return null;

    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address,
        abi: attestationEmitterAbi,
        functionName: 'commitReasoning',
        args: [reasoningHash, actionIntent],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error('[attestation] commitReasoning failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  async revealExecution(
    reasoningHash: `0x${string}`,
    myxTxHash: `0x${string}`,
    orderId: `0x${string}`
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    const address = getContractAddress();
    if (!address) return null;

    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address,
        abi: attestationEmitterAbi,
        functionName: 'revealExecution',
        args: [reasoningHash, myxTxHash, orderId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error('[attestation] revealExecution failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }
}
