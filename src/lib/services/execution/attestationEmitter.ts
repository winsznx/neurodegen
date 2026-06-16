import { keccak256, pad, stringToBytes, toHex } from 'viem';
import { attestationEmitterAbi } from '@/lib/abis/attestationEmitter';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { ENABLE_ATTESTATION } from '@/config/features';
import { bscChain, getAgentWalletClient, publicClient } from '@/lib/clients/chain';
import type { RegimeLabel } from '@/types/perception';

function regimeToBytes32(regime: RegimeLabel): `0x${string}` {
  return pad(toHex(regime), { size: 32 });
}

function actionToBytes32(action: string): `0x${string}` {
  // Pad-right is fine: the action string fits in 32 bytes (max 10 chars).
  const slice = stringToBytes(action).slice(0, 32);
  const padded = new Uint8Array(32);
  padded.set(slice);
  return pad(toHex(padded), { size: 32 });
}

/**
 * Hash an on-chain swap tx hash into bytes32 for the `revealExecution.orderId`
 * field. V1 audit §1.2b: V1 wrote keccak(localUuid) — useless. V2 writes
 * keccak(twakTxHash) so the on-chain reveal is verifiably bound to the swap.
 */
export function orderIdFromTxHash(twakTxHash: `0x${string}`): `0x${string}` {
  return keccak256(stringToBytes(twakTxHash));
}

export class AttestationEmitter {
  private get address(): `0x${string}` | null {
    return ATTESTATION_CONTRACT_ADDRESS ? (ATTESTATION_CONTRACT_ADDRESS as `0x${string}`) : null;
  }

  async commitReasoning(
    reasoningHash: `0x${string}`,
    actionIntent: string,
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    if (!this.address) return null;
    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address: this.address,
        abi: attestationEmitterAbi,
        functionName: 'commitReasoning',
        args: [reasoningHash, actionToBytes32(actionIntent)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error(
        '[attestation] commitReasoning failed:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  async revealExecution(
    reasoningHash: `0x${string}`,
    twakTxHash: `0x${string}`,
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    if (!this.address) return null;
    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address: this.address,
        abi: attestationEmitterAbi,
        functionName: 'revealExecution',
        args: [reasoningHash, twakTxHash, orderIdFromTxHash(twakTxHash)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error(
        '[attestation] revealExecution failed:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  async attestPositionOpen(
    reasoningHash: `0x${string}`,
    pairIndex: number,
    isLong: boolean,
    sizeAmount: bigint,
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    if (!this.address) return null;
    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address: this.address,
        abi: attestationEmitterAbi,
        functionName: 'attestPositionOpen',
        args: [reasoningHash, BigInt(pairIndex), isLong, sizeAmount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error(
        '[attestation] attestPositionOpen failed:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  async attestPositionClose(
    reasoningHash: `0x${string}`,
    pairIndex: number,
    isLong: boolean,
    realizedPnl: bigint,
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    if (!this.address) return null;
    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address: this.address,
        abi: attestationEmitterAbi,
        functionName: 'attestPositionClose',
        args: [reasoningHash, BigInt(pairIndex), isLong, realizedPnl],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error(
        '[attestation] attestPositionClose failed:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  async attestRegimeChange(
    fromRegime: RegimeLabel,
    toRegime: RegimeLabel,
  ): Promise<`0x${string}` | null> {
    if (!ENABLE_ATTESTATION) return null;
    if (!this.address) return null;
    try {
      const walletClient = getAgentWalletClient();
      const hash = await walletClient.writeContract({
        account: walletClient.account!,
        chain: bscChain,
        address: this.address,
        abi: attestationEmitterAbi,
        functionName: 'attestRegimeChange',
        args: [regimeToBytes32(fromRegime), regimeToBytes32(toRegime)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      console.error(
        '[attestation] attestRegimeChange failed:',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }
}

export const attestationEmitter = new AttestationEmitter();
