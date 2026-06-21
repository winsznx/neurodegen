import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, bscTestnet } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadArtifact(): { abi: readonly unknown[]; bytecode: `0x${string}` } {
  const artifactPath = resolve(__dirname, '../artifacts/NeurodegenAttestationV2.json');
  const raw = readFileSync(artifactPath, 'utf8');
  const json = JSON.parse(raw) as { abi: readonly unknown[]; bytecode: string };
  return {
    abi: json.abi,
    bytecode: (json.bytecode.startsWith('0x') ? json.bytecode : `0x${json.bytecode}`) as `0x${string}`,
  };
}

async function main(): Promise<void> {
  // Deployer pays gas. Use a SEPARATE wallet from the agent wallet — the
  // constructor takes the agent address as a constructor arg, and the
  // contract becomes immutable to that address forever.
  const deployerPk = process.env.DEPLOYER_PRIVATE_KEY;
  const agentAddress = process.env.NEURODEGEN_AGENT_ADDRESS;
  const rpc = process.env.BSC_RPC_URL;
  const network = (process.env.BSC_NETWORK ?? 'mainnet').toLowerCase();

  if (!deployerPk) throw new Error('DEPLOYER_PRIVATE_KEY env var is required');
  if (!agentAddress) throw new Error('NEURODEGEN_AGENT_ADDRESS env var is required (the address that will be allowed to emit events)');
  if (!rpc) throw new Error('BSC_RPC_URL env var is required');
  if (!/^0x[0-9a-fA-F]{40}$/.test(agentAddress)) {
    throw new Error(`NEURODEGEN_AGENT_ADDRESS is not a valid 20-byte address: ${agentAddress}`);
  }

  const chain = network === 'testnet' ? bscTestnet : bsc;
  const deployer = privateKeyToAccount(deployerPk as `0x${string}`);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ chain, transport: http(rpc), account: deployer });

  const { abi, bytecode } = loadArtifact();

  console.log(`[deploy-v2] network: ${chain.name} (chainId ${chain.id})`);
  console.log(`[deploy-v2] deployer: ${deployer.address}`);
  console.log(`[deploy-v2] agent (immutable owner): ${agentAddress}`);

  const balance = await publicClient.getBalance({ address: deployer.address });
  console.log(`[deploy-v2] deployer balance: ${(Number(balance) / 1e18).toFixed(6)} BNB`);
  if (balance < 5_000_000_000_000_000n) {
    throw new Error('deployer balance below 0.005 BNB — refusing to broadcast');
  }

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [agentAddress as `0x${string}`],
  });
  console.log(`[deploy-v2] tx hash: ${hash}`);
  console.log(`[deploy-v2] waiting for confirmation…`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`deployment reverted: ${hash}`);
  }
  if (!receipt.contractAddress) {
    throw new Error('deployment receipt missing contractAddress');
  }

  console.log('');
  console.log('============================================================');
  console.log(`[deploy-v2] SUCCESS`);
  console.log(`[deploy-v2] contract address: ${receipt.contractAddress}`);
  console.log(`[deploy-v2] block number: ${receipt.blockNumber}`);
  console.log(`[deploy-v2] gas used: ${receipt.gasUsed}`);
  console.log('============================================================');
  console.log('');
  console.log(`Next steps:`);
  console.log(`  1. Set in Railway env (BOTH services):`);
  console.log(`       ATTESTATION_V2_CONTRACT_ADDRESS=${receipt.contractAddress}`);
  console.log(`       ATTESTATION_V2_DEPLOY_BLOCK=${receipt.blockNumber}`);
  console.log(`  2. Verify on BscScan: pnpm attestation:v2:verify -- ${receipt.contractAddress} ${agentAddress}`);
}

main().catch((err) => {
  console.error('[deploy-v2] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
