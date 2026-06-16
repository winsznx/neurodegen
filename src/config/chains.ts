export const BSC_CHAIN_ID: number = 56;
export const BSC_BLOCK_TIME_MS: number = 3_000;

export const ATTESTATION_CONTRACT_ADDRESS: `0x${string}` =
  (process.env.ATTESTATION_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0xe21f5ebec3f098c744c1e35db0c9338d6b717dc4';

// First block at which the deployed AttestationEmitter exists. Used as a `fromBlock`
// floor when scanning historical commit/reveal logs from the /proof page.
export const ATTESTATION_DEPLOY_BLOCK: bigint = 93750710n;

// Competition registration contract on BSC mainnet (per TWAK `twak compete register`).
export const COMPETITION_CONTRACT_ADDRESS: `0x${string}` =
  (process.env.COMPETITION_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0x212c61b9b72c95d95bf29cf032f5e5635629aed5';

export const ZERO_ADDRESS: `0x${string}` = '0x0000000000000000000000000000000000000000';

// Common BEP-20 tokens used as quote currencies and probe-trade endpoints.
export const BSC_USDT_ADDRESS: `0x${string}` = '0x55d398326f99059fF775485246999027B3197955';
export const BSC_BUSD_ADDRESS: `0x${string}` = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';
export const BSC_CAKE_ADDRESS: `0x${string}` = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
export const BSC_WBNB_ADDRESS: `0x${string}` = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

// Pyth Hermes feed IDs for the oracle divergence check.
export const PYTH_FEED_IDS = {
  BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BNB_USD: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
} as const;

export type PythFeedSymbol = keyof typeof PYTH_FEED_IDS;
