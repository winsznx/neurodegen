import { keccak256, stringToBytes } from 'viem';
import {
  ERC8183_COMMERCE_ADDRESS,
  ERC8183_EVALUATOR_ROUTER_ADDRESS,
  ERC8183_OPTIMISTIC_POLICY_ADDRESS,
  ERC8183_PAYMENT_TOKEN_ADDRESS,
} from '@/config/chains';
import {
  DRY_RUN_MODE,
  ENABLE_ERC8183_JOBS,
  ERC8183_JOB_BUDGET_WEI,
} from '@/config/features';
import { twakClient } from '@/lib/clients/twakClient';
import { canonicalize } from '@/lib/utils/canonicalSerialize';
import type {
  ActionRecommendation,
  CommitteeSession,
  ExecutionResultRecord,
} from '@/types/cognition';

const JOB_EXPIRY_SECONDS = 24 * 60 * 60; // 24h

export interface NegotiationContent {
  chain_id: 56;
  currency: `0x${string}`;
  negotiated_at: number;
  price: string;
  task: string;
  terms: {
    deliverables: string;
    quality_standards: string;
    success_criteria: string[];
  };
  verifying_contract: `0x${string}`;
  version: 1;
}

export interface DeliverableManifest {
  chain_id: 56;
  contracts: {
    commerce: `0x${string}`;
    policy: `0x${string}`;
    router: `0x${string}`;
  };
  job_id: string;
  metadata: {
    action: ActionRecommendation['action'];
    attestationCommitTx: `0x${string}` | null;
    attestationRevealTx: `0x${string}` | null;
    confidence: number;
    executedAt: string;
    reasoningHash: `0x${string}`;
    sessionId: string;
    sessionNumber: number;
    tokenSymbol: string | null;
  };
  response: {
    content: string;
    content_type: 'text/plain';
  };
  version: 1;
}

export interface CommerceJobResult {
  attempted: boolean;
  jobId: string | null;
  createTx: `0x${string}` | null;
  budgetTx: `0x${string}` | null;
  fundTx: `0x${string}` | null;
  submitTx: `0x${string}` | null;
  negotiationHash: `0x${string}` | null;
  providerSignature: `0x${string}` | null;
  deliverable: `0x${string}` | null;
  skippedReason: string | null;
  failedStep: 'create' | 'set-budget' | 'fund' | 'submit' | null;
  failedMessage: string | null;
}

const EMPTY_RESULT: CommerceJobResult = {
  attempted: false,
  jobId: null,
  createTx: null,
  budgetTx: null,
  fundTx: null,
  submitTx: null,
  negotiationHash: null,
  providerSignature: null,
  deliverable: null,
  skippedReason: null,
  failedStep: null,
  failedMessage: null,
};

/**
 * Build the off-chain ERC-8183 NegotiationContent for a committee session.
 *
 * The content schema mirrors bnbagent-sdk's `_build_description_content` —
 * canonicalized via sorted-key JSON, hashed with keccak256, signed via
 * EIP-191 personal_sign (TWAK `wallet sign-message`). The signature is
 * stored alongside the on-chain job so any observer can verify that the
 * provider (the agent itself, in self-employed mode) agreed to the price
 * before the job was funded.
 */
export function buildNegotiationContent(args: {
  session: CommitteeSession;
  agentWallet: `0x${string}`;
  now: Date;
}): NegotiationContent {
  const action = args.session.finalAction;
  return {
    chain_id: 56,
    currency: ERC8183_PAYMENT_TOKEN_ADDRESS,
    negotiated_at: Math.floor(args.now.getTime() / 1000),
    price: ERC8183_JOB_BUDGET_WEI,
    task: `committee_decision:${args.session.reasoningHash}:${action.action}:${action.tokenSymbol ?? 'none'}`,
    terms: {
      deliverables:
        'Execute the committee-recommended action through TWAK and submit a signed deliverable manifest linking the on-chain swap to the reasoning hash.',
      quality_standards:
        'All eight PreExecutionChecker guardrails must pass; commit-reveal must land before/after the swap; deliverable must include twakTxHash and attestationCommitTx.',
      success_criteria: [
        'TWAK swap succeeds and tx is mined',
        'AttestationEmitter commit lands BEFORE the swap',
        'AttestationEmitter reveal lands AFTER the swap',
        'Deliverable manifest hash recomputes byte-identical from the persisted session row',
      ],
    },
    verifying_contract: ERC8183_COMMERCE_ADDRESS,
    version: 1,
  };
}

export function buildDeliverableManifest(args: {
  jobId: string;
  session: CommitteeSession;
  executionResult: ExecutionResultRecord;
  executedAt: Date;
}): DeliverableManifest {
  const action = args.session.finalAction;
  return {
    chain_id: 56,
    contracts: {
      commerce: ERC8183_COMMERCE_ADDRESS,
      policy: ERC8183_OPTIMISTIC_POLICY_ADDRESS,
      router: ERC8183_EVALUATOR_ROUTER_ADDRESS,
    },
    job_id: args.jobId,
    metadata: {
      action: action.action,
      attestationCommitTx: args.session.attestationCommitTx,
      attestationRevealTx: args.executionResult.attestationRevealTx,
      confidence: action.confidence,
      executedAt: args.executedAt.toISOString(),
      reasoningHash: args.session.reasoningHash,
      sessionId: args.session.sessionId,
      sessionNumber: args.session.sessionNumber,
      tokenSymbol: action.tokenSymbol,
    },
    response: {
      content: args.executionResult.twakTxHash
        ? `TWAK ${action.action} ${action.tokenSymbol ?? 'none'} executed: ${args.executionResult.twakTxHash}`
        : `TWAK ${action.action} not executed: ${args.executionResult.failureReason ?? 'unknown'}`,
      content_type: 'text/plain',
    },
    version: 1,
  };
}

export function keccakOfCanonical(value: unknown): `0x${string}` {
  return keccak256(stringToBytes(canonicalize(value)));
}

/**
 * Run the ERC-8183 job lifecycle for one committee decision. Self-employed:
 * the agent's TWAK wallet is BOTH the client and the provider — it pays
 * itself to execute the trade, and submits a tamper-evident manifest as the
 * deliverable. The OptimisticPolicy contract serves as the evaluator so the
 * job can be settled by anyone after the 7-day dispute window.
 *
 * Failure-tolerant: any step failure is captured and returned; the caller
 * (agentLoop) should never let a commerce-job failure crash the cycle.
 */
export async function runCommerceJobForSession(args: {
  session: CommitteeSession;
  executionResult: ExecutionResultRecord;
  agentWallet: `0x${string}`;
  now?: Date;
}): Promise<CommerceJobResult> {
  const now = args.now ?? new Date();

  if (!ENABLE_ERC8183_JOBS) {
    return { ...EMPTY_RESULT, skippedReason: 'ENABLE_ERC8183_JOBS=false' };
  }
  if (DRY_RUN_MODE) {
    return { ...EMPTY_RESULT, skippedReason: 'DRY_RUN_MODE=true' };
  }
  if (!args.executionResult.executed) {
    return { ...EMPTY_RESULT, skippedReason: 'execution skipped — no swap to wrap' };
  }
  if (args.session.finalAction.action === 'hold') {
    return { ...EMPTY_RESULT, skippedReason: 'final action is hold' };
  }

  const result: CommerceJobResult = { ...EMPTY_RESULT, attempted: true };

  // 1. Off-chain negotiation: build, hash, sign.
  const content = buildNegotiationContent({
    session: args.session,
    agentWallet: args.agentWallet,
    now,
  });
  const negotiationHash = keccakOfCanonical(content);
  result.negotiationHash = negotiationHash;
  try {
    const sig = await twakClient.walletSignMessage({ message: negotiationHash });
    result.providerSignature = sig.signature;
  } catch (err) {
    // Non-fatal: provider_sig is off-chain audit only. Carry on with empty sig.
    console.warn(
      '[agentic-commerce] wallet sign-message failed:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // 2. createJob — self-employed: provider == client == agent wallet.
  const description = `negotiationHash=${negotiationHash};reasoningHash=${args.session.reasoningHash}`;
  try {
    const created = await twakClient.erc8183CreateJob({
      provider: args.agentWallet,
      evaluator: ERC8183_OPTIMISTIC_POLICY_ADDRESS,
      expiredAt: Math.floor(now.getTime() / 1000) + JOB_EXPIRY_SECONDS,
      description,
    });
    result.jobId = created.jobId;
    result.createTx = created.txHash;
  } catch (err) {
    result.failedStep = 'create';
    result.failedMessage = err instanceof Error ? err.message : String(err);
    return result;
  }

  // 3. setBudget
  try {
    const budget = await twakClient.erc8183SetBudget({
      jobId: result.jobId!,
      amount: ERC8183_JOB_BUDGET_WEI,
    });
    result.budgetTx = budget.txHash;
  } catch (err) {
    result.failedStep = 'set-budget';
    result.failedMessage = err instanceof Error ? err.message : String(err);
    return result;
  }

  // 4. fund — the agent is self-funding (client and provider are the same wallet).
  try {
    const funded = await twakClient.erc8183Fund({
      jobId: result.jobId!,
      expectedBudget: ERC8183_JOB_BUDGET_WEI,
    });
    result.fundTx = funded.txHash;
  } catch (err) {
    result.failedStep = 'fund';
    result.failedMessage = err instanceof Error ? err.message : String(err);
    return result;
  }

  // 5. submit deliverable.
  const manifest = buildDeliverableManifest({
    jobId: result.jobId!,
    session: args.session,
    executionResult: args.executionResult,
    executedAt: now,
  });
  const deliverable = keccakOfCanonical(manifest);
  result.deliverable = deliverable;
  try {
    const submitted = await twakClient.erc8183Submit({
      jobId: result.jobId!,
      deliverable,
    });
    result.submitTx = submitted.txHash;
  } catch (err) {
    result.failedStep = 'submit';
    result.failedMessage = err instanceof Error ? err.message : String(err);
    return result;
  }

  return result;
}
