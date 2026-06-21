import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters } from 'viem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Submits the V2 contract source to BscScan for verification using the
 * Etherscan-compatible v2 API.
 *
 * Usage:
 *   BSCSCAN_API_KEY=… pnpm attestation:v2:verify -- <contractAddress> <agentAddress>
 *
 * On testnet, pass BSC_NETWORK=testnet to switch to api-testnet.bscscan.com.
 */
async function main(): Promise<void> {
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) throw new Error('BSCSCAN_API_KEY env var is required (get one at https://bscscan.com/apis)');

  const args = process.argv.slice(2);
  const contractAddress = args[0];
  const agentAddress = args[1];
  if (!contractAddress || !agentAddress) {
    throw new Error('usage: pnpm attestation:v2:verify -- <contractAddress> <agentAddress>');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error('invalid contract address');
  if (!/^0x[0-9a-fA-F]{40}$/.test(agentAddress)) throw new Error('invalid agent address');

  const network = (process.env.BSC_NETWORK ?? 'mainnet').toLowerCase();
  const apiBase =
    network === 'testnet'
      ? 'https://api-testnet.bscscan.com/api'
      : 'https://api.bscscan.com/api';

  const sourcePath = resolve(__dirname, '../contracts/NeurodegenAttestationV2.sol');
  const source = readFileSync(sourcePath, 'utf8');

  // The constructor takes one `address agent` arg — ABI-encode it as the
  // 64-char hex string BscScan expects (no 0x prefix).
  const encoded = encodeAbiParameters(
    [{ type: 'address' }],
    [agentAddress as `0x${string}`],
  );
  const constructorArgs = encoded.replace(/^0x/, '');

  const body = new URLSearchParams({
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: contractAddress,
    sourceCode: source,
    codeformat: 'solidity-single-file',
    contractname: 'NeurodegenAttestationV2',
    compilerversion: 'v0.8.20+commit.a1b79de6',
    optimizationUsed: '1',
    runs: '200',
    evmversion: 'paris',
    licenseType: '11', // AGPL-3.0-only on BscScan
    constructorArguements: constructorArgs,
  });

  console.log(`[verify-v2] submitting source to ${apiBase}`);
  const submit = await fetch(apiBase, { method: 'POST', body });
  const submitJson = (await submit.json()) as { status: string; message: string; result: string };
  if (submitJson.status !== '1') {
    throw new Error(`verify submit failed: ${submitJson.message} — ${submitJson.result}`);
  }
  const guid = submitJson.result;
  console.log(`[verify-v2] submitted, guid=${guid}`);

  // Poll for completion. BscScan typically responds within 30–60s.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const check = await fetch(
      `${apiBase}?module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`,
    );
    const checkJson = (await check.json()) as { status: string; result: string };
    if (checkJson.result === 'Pending in queue') {
      console.log(`[verify-v2] still pending… (${(i + 1) * 5}s)`);
      continue;
    }
    if (checkJson.status === '1' && /Pass/i.test(checkJson.result)) {
      console.log(`[verify-v2] SUCCESS: ${checkJson.result}`);
      console.log(`[verify-v2] view: https://${network === 'testnet' ? 'testnet.' : ''}bscscan.com/address/${contractAddress}#code`);
      return;
    }
    throw new Error(`verify failed: ${checkJson.result}`);
  }
  throw new Error('verify timed out after 150s');
}

main().catch((err) => {
  console.error('[verify-v2] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
