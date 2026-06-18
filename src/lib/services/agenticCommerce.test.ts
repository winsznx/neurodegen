import { beforeEach, describe, expect, it, vi } from 'vitest';

const createJobMock = vi.fn();
const setBudgetMock = vi.fn();
const fundMock = vi.fn();
const submitMock = vi.fn();
const signMessageMock = vi.fn();

vi.mock('@/lib/clients/twakClient', () => ({
  twakClient: {
    erc8183CreateJob: (...args: unknown[]) => createJobMock(...args),
    erc8183SetBudget: (...args: unknown[]) => setBudgetMock(...args),
    erc8183Fund: (...args: unknown[]) => fundMock(...args),
    erc8183Submit: (...args: unknown[]) => submitMock(...args),
    walletSignMessage: (...args: unknown[]) => signMessageMock(...args),
  },
}));

vi.mock('@/config/features', () => ({
  DRY_RUN_MODE: false,
  ENABLE_ERC8183_JOBS: true,
  ERC8183_JOB_BUDGET_WEI: '10000000000000000',
}));

vi.mock('@/config/chains', () => ({
  ERC8183_COMMERCE_ADDRESS: '0xea4daa3100a767e86fded867729ae7446476eba6',
  ERC8183_EVALUATOR_ROUTER_ADDRESS: '0x51895229e12f9876011789b04f8698af06ccd6da',
  ERC8183_OPTIMISTIC_POLICY_ADDRESS: '0x9c01845705b3078aa2e8cff7520a6376fd766de5',
  ERC8183_PAYMENT_TOKEN_ADDRESS: '0xcE24439F2D9C6a2289F741120FE202248B666666',
}));

import {
  buildDeliverableManifest,
  buildNegotiationContent,
  keccakOfCanonical,
  runCommerceJobForSession,
} from './agenticCommerce';
import type {
  ActionRecommendation,
  CommitteeSession,
  ExecutionResultRecord,
} from '@/types/cognition';

const AGENT_WALLET = '0x9fe816A8bD6933464c177ba94890aEDE5CD5aA5A' as `0x${string}`;

function makeSession(overrides: Partial<CommitteeSession> = {}): CommitteeSession {
  const action: ActionRecommendation = {
    action: 'open_long',
    tokenSymbol: 'CAKE',
    tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    confidence: 0.7,
    positionSizeUSD: 100,
    leverageMultiplier: 1,
    tpPercentage: 0.05,
    slPercentage: 0.02,
    rationale: 'r',
    plainLanguageExplanation: 'e',
  };
  return {
    sessionId: 's-1',
    sessionNumber: 42,
    createdAt: 0,
    regime: 'momentum',
    previousRegime: null,
    fearGreedAtSession: 60,
    inputMetrics: {} as CommitteeSession['inputMetrics'],
    evGateDecisions: [],
    x402SpendThisSessionUSDC: 0,
    narrativeCall: {} as CommitteeSession['narrativeCall'],
    quantCall: {} as CommitteeSession['quantCall'],
    dissentResult: {} as CommitteeSession['dissentResult'],
    riskCall: {} as CommitteeSession['riskCall'],
    finalAction: action,
    reasoningHash: '0xabc' as `0x${string}`,
    attestationCommitTx: '0xcommit' as `0x${string}`,
    executionResult: null,
    ...overrides,
  };
}

const EXECUTED_RESULT: ExecutionResultRecord = {
  executed: true,
  twakTxHash: '0xtwak' as `0x${string}`,
  bscscanUrl: 'https://bscscan.com/tx/0xtwak',
  attestationRevealTx: '0xreveal' as `0x${string}`,
  failureReason: null,
};

describe('buildNegotiationContent', () => {
  it('produces deterministic JSON canonicalisation for the same input', () => {
    // #given
    const session = makeSession();
    const now = new Date('2026-06-17T00:00:00Z');
    // #when
    const a = buildNegotiationContent({ session, agentWallet: AGENT_WALLET, now });
    const b = buildNegotiationContent({ session, agentWallet: AGENT_WALLET, now });
    // #then
    expect(keccakOfCanonical(a)).toBe(keccakOfCanonical(b));
  });

  it('changes the hash when the session reasoning hash changes', () => {
    // #given
    const now = new Date('2026-06-17T00:00:00Z');
    const a = buildNegotiationContent({
      session: makeSession({ reasoningHash: '0xaaaa' as `0x${string}` }),
      agentWallet: AGENT_WALLET,
      now,
    });
    const b = buildNegotiationContent({
      session: makeSession({ reasoningHash: '0xbbbb' as `0x${string}` }),
      agentWallet: AGENT_WALLET,
      now,
    });
    // #then
    expect(keccakOfCanonical(a)).not.toBe(keccakOfCanonical(b));
  });
});

describe('buildDeliverableManifest', () => {
  it('embeds the on-chain twakTxHash and reasoning hash in metadata', () => {
    // #given
    const manifest = buildDeliverableManifest({
      jobId: '7',
      session: makeSession(),
      executionResult: EXECUTED_RESULT,
      executedAt: new Date('2026-06-17T00:00:00Z'),
    });
    // #then
    expect(manifest.job_id).toBe('7');
    expect(manifest.metadata.reasoningHash).toBe('0xabc');
    expect(manifest.metadata.attestationCommitTx).toBe('0xcommit');
    expect(manifest.metadata.attestationRevealTx).toBe('0xreveal');
    expect(manifest.response.content).toContain('0xtwak');
  });

  it('records the failure reason in content when execution did not happen', () => {
    // #given
    const failed: ExecutionResultRecord = {
      executed: false,
      twakTxHash: null,
      bscscanUrl: null,
      attestationRevealTx: null,
      failureReason: 'oracle divergence > 2%',
    };
    // #when
    const manifest = buildDeliverableManifest({
      jobId: '8',
      session: makeSession(),
      executionResult: failed,
      executedAt: new Date('2026-06-17T00:00:00Z'),
    });
    // #then
    expect(manifest.response.content).toContain('oracle divergence');
  });
});

describe('runCommerceJobForSession', () => {
  beforeEach(() => {
    createJobMock.mockReset();
    setBudgetMock.mockReset();
    fundMock.mockReset();
    submitMock.mockReset();
    signMessageMock.mockReset();
  });

  it('skips the lifecycle when the final action is hold', async () => {
    // #given
    const session = makeSession({
      finalAction: { ...makeSession().finalAction, action: 'hold', tokenSymbol: null },
    });
    // #when
    const result = await runCommerceJobForSession({
      session,
      executionResult: EXECUTED_RESULT,
      agentWallet: AGENT_WALLET,
    });
    // #then
    expect(result.attempted).toBe(false);
    expect(result.skippedReason).toContain('hold');
    expect(createJobMock).not.toHaveBeenCalled();
  });

  it('skips when execution did not happen', async () => {
    // #given
    const failed: ExecutionResultRecord = {
      executed: false,
      twakTxHash: null,
      bscscanUrl: null,
      attestationRevealTx: null,
      failureReason: 'preflight failed',
    };
    // #when
    const result = await runCommerceJobForSession({
      session: makeSession(),
      executionResult: failed,
      agentWallet: AGENT_WALLET,
    });
    // #then
    expect(result.attempted).toBe(false);
    expect(result.skippedReason).toContain('execution skipped');
  });

  it('runs the full create → budget → fund → submit chain on the happy path', async () => {
    // #given
    signMessageMock.mockResolvedValueOnce({ signature: '0xsig', digest: '0xdigest' });
    createJobMock.mockResolvedValueOnce({ jobId: '99', txHash: '0xcreate' });
    setBudgetMock.mockResolvedValueOnce({ txHash: '0xbudget' });
    fundMock.mockResolvedValueOnce({ txHash: '0xfund' });
    submitMock.mockResolvedValueOnce({ txHash: '0xsubmit' });

    // #when
    const result = await runCommerceJobForSession({
      session: makeSession(),
      executionResult: EXECUTED_RESULT,
      agentWallet: AGENT_WALLET,
    });

    // #then
    expect(result.attempted).toBe(true);
    expect(result.jobId).toBe('99');
    expect(result.createTx).toBe('0xcreate');
    expect(result.budgetTx).toBe('0xbudget');
    expect(result.fundTx).toBe('0xfund');
    expect(result.submitTx).toBe('0xsubmit');
    expect(result.failedStep).toBeNull();
    expect(createJobMock).toHaveBeenCalledTimes(1);
    expect(setBudgetMock).toHaveBeenCalledTimes(1);
    expect(fundMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('stops at the first failing step and records failedStep + failedMessage', async () => {
    // #given
    signMessageMock.mockResolvedValueOnce({ signature: '0xsig', digest: '0xdigest' });
    createJobMock.mockResolvedValueOnce({ jobId: '99', txHash: '0xcreate' });
    setBudgetMock.mockResolvedValueOnce({ txHash: '0xbudget' });
    fundMock.mockRejectedValueOnce(new Error('insufficient U balance'));

    // #when
    const result = await runCommerceJobForSession({
      session: makeSession(),
      executionResult: EXECUTED_RESULT,
      agentWallet: AGENT_WALLET,
    });

    // #then
    expect(result.attempted).toBe(true);
    expect(result.jobId).toBe('99');
    expect(result.failedStep).toBe('fund');
    expect(result.failedMessage).toContain('insufficient U balance');
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('non-fatal sign-message failure: keeps going and submits anyway', async () => {
    // #given
    signMessageMock.mockRejectedValueOnce(new Error('wallet locked'));
    createJobMock.mockResolvedValueOnce({ jobId: '5', txHash: '0xcreate' });
    setBudgetMock.mockResolvedValueOnce({ txHash: '0xbudget' });
    fundMock.mockResolvedValueOnce({ txHash: '0xfund' });
    submitMock.mockResolvedValueOnce({ txHash: '0xsubmit' });

    // #when
    const result = await runCommerceJobForSession({
      session: makeSession(),
      executionResult: EXECUTED_RESULT,
      agentWallet: AGENT_WALLET,
    });

    // #then
    expect(result.providerSignature).toBeNull();
    expect(result.submitTx).toBe('0xsubmit');
    expect(result.failedStep).toBeNull();
  });
});
