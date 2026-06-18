import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWorkerStateMock = vi.fn();
const setWorkerStateMock = vi.fn();
const erc8004RegisterMock = vi.fn();

vi.mock('@/lib/queries/workerState', () => ({
  getWorkerState: (...args: unknown[]) => getWorkerStateMock(...args),
  setWorkerState: (...args: unknown[]) => setWorkerStateMock(...args),
}));

vi.mock('@/lib/clients/twakClient', () => ({
  twakClient: {
    erc8004Register: (...args: unknown[]) => erc8004RegisterMock(...args),
  },
}));

vi.mock('@/config/features', () => ({
  DRY_RUN_MODE: false,
  ENABLE_ERC8004_REGISTRATION: true,
}));

vi.mock('@/config/chains', () => ({
  ERC8004_REGISTRY_ADDRESS: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
}));

import {
  buildAgentCardJson,
  buildAgentCardUri,
  ensureErc8004Registration,
  ERC8004_REGISTRATION_KEY,
  type PersistedErc8004Registration,
} from './bnbAgentRegistration';

const FRESH_RECORD: PersistedErc8004Registration = {
  registered: true,
  agentId: '42',
  txHash: '0xabc' as `0x${string}`,
  registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  uri: 'data:application/json;base64,eyJzaWduZXIiOiJ0ZXN0In0=',
  registeredAt: '2026-06-17T00:00:00.000Z',
  alreadyRegistered: false,
  dryRun: false,
};

describe('buildAgentCardJson', () => {
  it('produces a deterministic JSON for the same input', () => {
    // #given
    const a = buildAgentCardJson({
      name: 'NeuroDegen V2',
      description: 'committee agent',
      webUrl: 'https://neurodegen.xyz',
      agentWallet: '0x9fe816A8bD6933464c177ba94890aEDE5CD5aA5A',
      chainId: 56,
    });
    // #when
    const b = buildAgentCardJson({
      name: 'NeuroDegen V2',
      description: 'committee agent',
      webUrl: 'https://neurodegen.xyz',
      agentWallet: '0x9fe816A8bD6933464c177ba94890aEDE5CD5aA5A',
      chainId: 56,
    });
    // #then
    expect(a).toEqual(b);
  });

  it('embeds the canonical EIP-8004 registration type', () => {
    // #given
    const card = JSON.parse(
      buildAgentCardJson({
        name: 'x',
        description: 'y',
        webUrl: 'https://x.test',
        agentWallet: '0xdead',
        chainId: 56,
      }),
    );
    // #then
    expect(card.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
    expect(Array.isArray(card.services)).toBe(true);
    expect(card.services[0].endpoint).toBe('https://x.test');
  });
});

describe('buildAgentCardUri', () => {
  it('produces a data: URI with base64-encoded payload', () => {
    // #given
    const json = '{"a":1}';
    // #when
    const uri = buildAgentCardUri(json);
    // #then
    expect(uri.startsWith('data:application/json;base64,')).toBe(true);
    const decoded = Buffer.from(uri.split(',')[1]!, 'base64').toString('utf8');
    expect(decoded).toBe(json);
  });
});

describe('ensureErc8004Registration', () => {
  beforeEach(() => {
    getWorkerStateMock.mockReset();
    setWorkerStateMock.mockReset();
    erc8004RegisterMock.mockReset();
  });

  it('returns the cached record without calling TWAK', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(FRESH_RECORD);

    // #when
    const result = await ensureErc8004Registration({});

    // #then
    expect(result).toEqual({ ok: true, reason: 'cached', record: FRESH_RECORD });
    expect(erc8004RegisterMock).not.toHaveBeenCalled();
    expect(setWorkerStateMock).not.toHaveBeenCalled();
  });

  it('calls TWAK, persists the result, and returns it when no cache exists', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);
    erc8004RegisterMock.mockResolvedValueOnce({
      agentId: '42',
      txHash: '0xnewtx',
      alreadyRegistered: false,
    });

    // #when
    const result = await ensureErc8004Registration({
      webUrl: 'https://neurodegen.xyz',
      agentWallet: '0x9fe' as `0x${string}`,
      now: new Date('2026-06-17T00:00:00Z'),
    });

    // #then
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBe('fresh');
      expect(result.record.agentId).toBe('42');
      expect(result.record.txHash).toBe('0xnewtx');
    }
    expect(setWorkerStateMock).toHaveBeenCalledTimes(1);
    expect(setWorkerStateMock.mock.calls[0]?.[0]).toBe(ERC8004_REGISTRATION_KEY);
  });

  it('returns twak_failed without persisting when the CLI throws', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);
    erc8004RegisterMock.mockRejectedValueOnce(new Error('rpc 503'));

    // #when
    const result = await ensureErc8004Registration({});

    // #then
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('twak_failed');
      expect(result.message).toContain('rpc 503');
    }
    expect(setWorkerStateMock).not.toHaveBeenCalled();
  });
});
