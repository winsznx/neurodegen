import type { MyxClient } from '@myx-trade/sdk';
import { getMyxClient } from '@/lib/clients/myxSdk';
import { getAgentWalletClient, publicClient } from '@/lib/clients/chain';
import { PythHermesClient } from '@/lib/clients/pyth';
import { hotState } from '@/lib/stores/hotState';
import { PreExecutionChecker } from './preExecutionChecker';
import { TransactionSubmitter } from './transactionSubmitter';
import { PositionTracker } from './positionTracker';
import { AttestationEmitter } from './attestationEmitter';
import { ExecutionGateway } from './executionGateway';
import { RiskManager } from './riskManager';

export interface ExecutionLayer {
  sdk: MyxClient;
  gateway: ExecutionGateway;
  tracker: PositionTracker;
  agentAddress: `0x${string}`;
}

export function buildExecutionLayer(): ExecutionLayer {
  const walletClient = getAgentWalletClient();
  if (!walletClient.account) throw new Error('wallet client has no account');
  const agentAddress = walletClient.account.address;

  const sdk = getMyxClient(walletClient);
  const pyth = new PythHermesClient(process.env.PYTH_HERMES_URL ?? 'https://hermes.pyth.network');
  const riskManager = new RiskManager();
  const preChecker = new PreExecutionChecker(publicClient, hotState, pyth, riskManager, agentAddress);
  const submitter = new TransactionSubmitter(sdk);
  const tracker = new PositionTracker(sdk, agentAddress);
  const attestation = new AttestationEmitter();
  const gateway = new ExecutionGateway(sdk, preChecker, submitter, tracker, attestation, agentAddress);

  return { sdk, gateway, tracker, agentAddress };
}
