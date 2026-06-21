import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getWorkerStateMock = vi.fn();
const setWorkerStateMock = vi.fn();
const registerMock = vi.fn();

vi.mock('@/lib/queries/workerState', () => ({
  getWorkerState: (...args: unknown[]) => getWorkerStateMock(...args),
  setWorkerState: (...args: unknown[]) => setWorkerStateMock(...args),
}));

vi.mock('@/lib/clients/twakClient', () => ({
  twakClient: {
    register: (...args: unknown[]) => registerMock(...args),
  },
}));

vi.mock('@/config/features', () => ({
  DRY_RUN_MODE: false,
}));

vi.mock('@/config/competition', () => ({
  COMPETITION_CONTRACT_ADDRESS: '0x212c61b9b72c95d95bf29cf032f5e5635629aed5',
  COMPETITION_REGISTRATION_DEADLINE: '2026-06-22T00:00:00Z',
  COMPETITION_TRADING_WINDOW_START: '2026-06-22T00:00:00Z',
}));

import {
  ensureCompetitionRegistration,
  preflightCompetitionState,
  COMPETITION_REGISTRATION_KEY,
  type PersistedCompetitionRegistration,
} from './competitionRegistration';

const FRESH_RECORD: PersistedCompetitionRegistration = {
  registered: true,
  txHash: '0xabc' as `0x${string}`,
  participant: '0xdef' as `0x${string}`,
  contract: '0x212c61b9b72c95d95bf29cf032f5e5635629aed5' as `0x${string}`,
  registeredAt: '2026-06-17T00:00:00.000Z',
  alreadyRegistered: false,
  dryRun: false,
};

describe('ensureCompetitionRegistration', () => {
  beforeEach(() => {
    getWorkerStateMock.mockReset();
    setWorkerStateMock.mockReset();
    registerMock.mockReset();
  });

  it('returns cached result without calling TWAK when state already has a registration', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(FRESH_RECORD);

    // #when
    const result = await ensureCompetitionRegistration(new Date('2026-06-17T00:00:00Z'));

    // #then
    expect(result).toEqual({ ok: true, reason: 'cached', record: FRESH_RECORD });
    expect(registerMock).not.toHaveBeenCalled();
    expect(setWorkerStateMock).not.toHaveBeenCalled();
  });

  it('calls TWAK and persists the result when no cache exists', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);
    registerMock.mockResolvedValueOnce({
      txHash: '0xnewtx',
      participant: '0xagent',
      alreadyRegistered: false,
      deadline: '2026-06-22T00:00:00Z',
      chain: 'bsc',
    });

    // #when
    const result = await ensureCompetitionRegistration(new Date('2026-06-17T00:00:00Z'));

    // #then
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBe('fresh');
      expect(result.record.txHash).toBe('0xnewtx');
      expect(result.record.participant).toBe('0xagent');
    }
    expect(setWorkerStateMock).toHaveBeenCalledTimes(1);
    expect(setWorkerStateMock.mock.calls[0]?.[0]).toBe(COMPETITION_REGISTRATION_KEY);
  });

  it('refuses to register after the deadline and does not call TWAK', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);

    // #when - one second after the deadline
    const result = await ensureCompetitionRegistration(new Date('2026-06-22T00:00:01Z'));

    // #then
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('deadline_passed');
    expect(registerMock).not.toHaveBeenCalled();
    expect(setWorkerStateMock).not.toHaveBeenCalled();
  });

  it('returns twak_failed when the TWAK CLI throws', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);
    registerMock.mockRejectedValueOnce(new Error('exit=1: wallet not unlocked'));

    // #when
    const result = await ensureCompetitionRegistration(new Date('2026-06-17T00:00:00Z'));

    // #then
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('twak_failed');
      expect(result.message).toContain('wallet not unlocked');
    }
    expect(setWorkerStateMock).not.toHaveBeenCalled();
  });
});

describe('preflightCompetitionState', () => {
  beforeEach(() => {
    getWorkerStateMock.mockReset();
  });

  it('returns empty list before the trading window opens', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);

    // #when - well before the 6/22 open
    const issues = await preflightCompetitionState(new Date('2026-06-17T00:00:00Z'));

    // #then
    expect(issues).toEqual([]);
  });

  it('warns when window has opened and no registration is persisted', async () => {
    // #given
    getWorkerStateMock.mockResolvedValueOnce(null);

    // #when - one second after window open
    const issues = await preflightCompetitionState(new Date('2026-06-22T00:00:01Z'));

    // #then
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((m) => /no persisted registration/.test(m))).toBe(true);
  });
});
