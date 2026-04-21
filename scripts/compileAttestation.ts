import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SolcInput {
  language: 'Solidity';
  sources: Record<string, { content: string }>;
  settings: {
    optimizer: { enabled: boolean; runs: number };
    outputSelection: Record<string, Record<string, string[]>>;
    evmVersion?: string;
  };
}

interface SolcOutput {
  errors?: Array<{ severity: string; formattedMessage: string }>;
  contracts: Record<string, Record<string, {
    abi: readonly unknown[];
    evm: { bytecode: { object: string } };
  }>>;
}

function main(): void {
  const contractPath = resolve(__dirname, '../contracts/NeurodegenAttestation.sol');
  const source = readFileSync(contractPath, 'utf8');

  const input: SolcInput = {
    language: 'Solidity',
    sources: {
      'NeurodegenAttestation.sol': { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as SolcOutput;

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === 'error');
    for (const e of output.errors) {
      console.log(e.formattedMessage);
    }
    if (fatal.length > 0) {
      throw new Error(`Solidity compilation failed (${fatal.length} errors)`);
    }
  }

  const contract = output.contracts['NeurodegenAttestation.sol']['NeurodegenAttestation'];
  if (!contract) throw new Error('NeurodegenAttestation contract not found in output');

  const artifactDir = resolve(__dirname, '../artifacts');
  mkdirSync(artifactDir, { recursive: true });

  const artifact = {
    contractName: 'NeurodegenAttestation',
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };

  const outPath = resolve(artifactDir, 'NeurodegenAttestation.json');
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`[compile] wrote ${outPath}`);
  console.log(`[compile] bytecode size: ${contract.evm.bytecode.object.length / 2} bytes`);
}

main();
