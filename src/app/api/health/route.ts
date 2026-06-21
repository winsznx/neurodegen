import { NextResponse } from 'next/server';
import { fetchWorkerStatusRaw } from '@/lib/services/workerAdminProxy';
import { getLatestMetrics } from '@/lib/queries/metrics';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';
import { COMPETITION_CONTRACT_ADDRESS } from '@/config/competition';
import {
  ERC8004_REGISTRY_ADDRESS,
  ERC8183_COMMERCE_ADDRESS,
  ERC8183_PAYMENT_TOKEN_ADDRESS,
} from '@/config/chains';
import { ENABLE_ERC8004_REGISTRATION, ENABLE_ERC8183_JOBS } from '@/config/features';
import {
  COMPETITION_REGISTRATION_KEY,
  preflightCompetitionState,
  type PersistedCompetitionRegistration,
} from '@/lib/services/competitionRegistration';
import {
  ERC8004_REGISTRATION_KEY,
  type PersistedErc8004Registration,
} from '@/lib/services/bnbAgentRegistration';
import { getWorkerState } from '@/lib/queries/workerState';

// Only env vars the WEB service actually uses (RPC for /proof reads, ADMIN_SECRET
// for worker proxy, SUPABASE_* for DB). CMC/DGRID/TWAK_AGENT_* are worker-only;
// the worker has its own preflight that warns if any of those are missing.
const REQUIRED_ENV = [
  'BSC_RPC_URL',
  'ADMIN_SECRET',
] as const;

export const dynamic = 'force-dynamic';

export async function GET() {
  const missing: string[] = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  const resolved = await fetchWorkerStatusRaw();

  let databaseHealthy = false;
  let databaseError: string | null = null;
  try {
    await getLatestMetrics();
    databaseHealthy = true;
  } catch (err) {
    databaseError = err instanceof Error ? err.message : String(err);
  }

  const registration = await getWorkerState<PersistedCompetitionRegistration>(
    COMPETITION_REGISTRATION_KEY,
  ).catch(() => null);
  const preflightIssues = await preflightCompetitionState().catch(() => []);
  const erc8004 = await getWorkerState<PersistedErc8004Registration>(
    ERC8004_REGISTRATION_KEY,
  ).catch(() => null);

  const services = {
    worker: resolved.ok,
    database: databaseHealthy,
    envConfigured: missing.length === 0,
    competitionRegistered: registration?.registered === true,
  };
  const healthy = Object.values(services).every(Boolean);

  // Build identifier: Railway sets RAILWAY_GIT_COMMIT_SHA; we also accept
  // VERCEL_GIT_COMMIT_SHA / GIT_SHA / NEXT_PUBLIC_GIT_SHA. Surfacing this lets
  // the operator confirm in one curl that Railway is actually serving the
  // expected commit (the #1 cause of "I shipped a fix but it's still broken").
  const gitSha =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_SHA ??
    null;
  const buildEnv =
    process.env.RAILWAY_ENVIRONMENT_NAME ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    null;

  return NextResponse.json({
    healthy,
    services,
    build: {
      gitSha,
      gitShaShort: gitSha ? gitSha.slice(0, 7) : null,
      environment: buildEnv,
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    },
    diagnostics: {
      missingEnv: missing,
      databaseError,
      workerStatus: resolved.ok ? resolved.status : null,
      workerError: resolved.ok ? null : resolved.detail,
      attestationContract: ATTESTATION_CONTRACT_ADDRESS,
      competition: {
        contract: COMPETITION_CONTRACT_ADDRESS,
        registration: registration
          ? {
              participant: registration.participant,
              txHash: registration.txHash,
              registeredAt: registration.registeredAt,
              alreadyRegistered: registration.alreadyRegistered,
              dryRun: registration.dryRun,
            }
          : null,
        preflightIssues,
      },
      bnbAgentSdk: {
        erc8004: {
          enabled: ENABLE_ERC8004_REGISTRATION,
          registry: ERC8004_REGISTRY_ADDRESS,
          registration: erc8004
            ? {
                agentId: erc8004.agentId,
                txHash: erc8004.txHash,
                registeredAt: erc8004.registeredAt,
                alreadyRegistered: erc8004.alreadyRegistered,
                dryRun: erc8004.dryRun,
              }
            : null,
        },
        erc8183: {
          enabled: ENABLE_ERC8183_JOBS,
          commerce: ERC8183_COMMERCE_ADDRESS,
          paymentToken: ERC8183_PAYMENT_TOKEN_ADDRESS,
        },
      },
    },
  });
}
