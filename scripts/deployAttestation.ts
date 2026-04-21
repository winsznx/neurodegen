import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadArtifact(): { abi: readonly unknown[]; bytecode: `0x${string}` } {
  const artifactPath = resolve(__dirname, '../artifacts/NeurodegenAttestation.json');
  const raw = readFileSync(artifactPath, 'utf8');
  const json = JSON.parse(raw) as { abi: readonly unknown[]; bytecode: string };
  return {
    abi: json.abi,
    bytecode: (json.bytecode.startsWith('0x') ? json.bytecode : `0x${json.bytecode}`) as `0x${string}`,
  };
}

async function main(): Promise<void> {
  const pk = process.env.NEURODEGEN_AGENT_PRIVATE_KEY;
  const rpc = process.env.BSC_RPC_URL;
  if (!pk) throw new Error('NEURODEGEN_AGENT_PRIVATE_KEY env var is required');
  if (!rpc) throw new Error('BSC_RPC_URL env var is required');

  const account = privateKeyToAccount(pk as `0x${string}`);
  const publicClient = createPublicClient({ chain: bsc, transport: http(rpc) });
  const walletClient = createWalletClient({ chain: bsc, transport: http(rpc), account });

  const { abi, bytecode } = loadArtifact();

  console.log(`[deploy] deploying NeurodegenAttestation from ${account.address}`);
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [account.address],
  });
  console.log(`[deploy] tx hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`deployment reverted: ${hash}`);
  }
  if (!receipt.contractAddress) {
    throw new Error('deployment receipt missing contractAddress');
  }

  console.log(`[deploy] contract deployed at ${receipt.contractAddress}`);
  console.log(`[deploy] set ATTESTATION_CONTRACT_ADDRESS=${receipt.contractAddress} in .env.local`);
  console.log(`[deploy] set ENABLE_ATTESTATION=true in src/config/features.ts to emit`);
}

main().catch((err) => {
  console.error('[deploy] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
