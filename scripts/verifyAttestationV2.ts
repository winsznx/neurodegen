import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAbiParameters } from 'viem';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Etherscan expects the exact compiler version that produced the bytecode in
 * the form `v0.8.28+commit.7893614a`. solc.version() returns
 * `0.8.28+commit.7893614a.Emscripten.clang` — strip the platform suffix and
 * prepend the `v`.
 */
function compilerVersionTag(): string {
  const raw = (solc as unknown as { version(): string }).version();
  const match = raw.match(/^(\d+\.\d+\.\d+\+commit\.[0-9a-f]+)/);
  if (!match) throw new Error(`unrecognised solc version: ${raw}`);
  return `v${match[1]}`;
}

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
  // Etherscan launched a v2 multichain API in 2024 that accepts ONE key across
  // 50+ chains including BSC. Prefer ETHERSCAN_API_KEY (multichain) if set,
  // fall back to BSCSCAN_API_KEY (legacy single-chain).
  // BscScan deprecated their V1 API in 2024 — only the Etherscan V2 multichain
  // endpoint accepts new verification submissions. The user can name the env
  // var ETHERSCAN_API_KEY, BSCSCAN_API_KEY, or BNBSCAN_API_KEY — same key
  // backing all of them — and we always submit to the V2 endpoint.
  const apiKey =
    process.env.ETHERSCAN_API_KEY ??
    process.env.BSCSCAN_API_KEY ??
    process.env.BNBSCAN_API_KEY ??
    process.env.BSC_SCAN_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ETHERSCAN_API_KEY / BSCSCAN_API_KEY / BNBSCAN_API_KEY env var is required (multichain v2 key from etherscan.io/apis)',
    );
  }
  const useV2 = true;

  const args = process.argv.slice(2);
  const contractAddress = args[0];
  const agentAddress = args[1];
  if (!contractAddress || !agentAddress) {
    throw new Error('usage: pnpm attestation:v2:verify -- <contractAddress> <agentAddress>');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) throw new Error('invalid contract address');
  if (!/^0x[0-9a-fA-F]{40}$/.test(agentAddress)) throw new Error('invalid agent address');

  const network = (process.env.BSC_NETWORK ?? 'mainnet').toLowerCase();
  const chainId = network === 'testnet' ? '97' : '56';
  // Etherscan v2 multichain: single endpoint with chainid param.
  // Legacy BscScan: chain-specific endpoint.
  const apiBase = useV2
    ? 'https://api.etherscan.io/v2/api'
    : network === 'testnet'
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

  const compilerVersion = compilerVersionTag();
  console.log(`[verify-v2] compiler version: ${compilerVersion}`);

  const submitBody = new URLSearchParams({
    apikey: apiKey,
    module: 'contract',
    action: 'verifysourcecode',
    contractaddress: contractAddress,
    sourceCode: source,
    codeformat: 'solidity-single-file',
    contractname: 'NeurodegenAttestationV2',
    compilerversion: compilerVersion,
    optimizationUsed: '1',
    runs: '200',
    evmversion: 'paris',
    licenseType: '11', // AGPL-3.0-only
    constructorArguements: constructorArgs,
  });

  // Etherscan V2 requires chainid as a URL query parameter, NOT in the form body.
  const submitUrl = useV2 ? `${apiBase}?chainid=${chainId}` : apiBase;

  console.log(`[verify-v2] api: ${useV2 ? 'Etherscan v2 multichain' : 'BscScan legacy'}`);
  console.log(`[verify-v2] submitting source to ${submitUrl}`);
  const submit = await fetch(submitUrl, { method: 'POST', body: submitBody });
  const submitJson = (await submit.json()) as { status: string; message: string; result: string };
  if (submitJson.status !== '1') {
    throw new Error(`verify submit failed: ${submitJson.message} — ${submitJson.result}`);
  }
  const guid = submitJson.result;
  console.log(`[verify-v2] submitted, guid=${guid}`);

  // Poll for completion. BscScan typically responds within 30–60s.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    const checkParams = new URLSearchParams({
      module: 'contract',
      action: 'checkverifystatus',
      guid,
      apikey: apiKey,
    });
    if (useV2) checkParams.set('chainid', chainId);
    const check = await fetch(`${apiBase}?${checkParams.toString()}`);
    if (!check.ok) {
      console.log(`[verify-v2] HTTP ${check.status} on status poll, retrying…`);
      continue;
    }
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
