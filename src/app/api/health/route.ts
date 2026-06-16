import { NextResponse } from 'next/server';
import { fetchWorkerStatusRaw } from '@/lib/services/workerAdminProxy';
import { getLatestMetrics } from '@/lib/queries/metrics';
import { ATTESTATION_CONTRACT_ADDRESS } from '@/config/chains';

const REQUIRED_ENV = [
  'BSC_RPC_URL',
  'CMC_PRO_API_KEY',
  'DGRID_API_KEY',
  'TWAK_AGENT_WALLET_ADDRESS',
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

  const services = {
    worker: resolved.ok,
    database: databaseHealthy,
    envConfigured: missing.length === 0,
  };
  const healthy = Object.values(services).every(Boolean);

  return NextResponse.json({
    healthy,
    services,
    diagnostics: {
      missingEnv: missing,
      databaseError,
      workerStatus: resolved.ok ? resolved.status : null,
      workerError: resolved.ok ? null : resolved.detail,
      attestationContract: ATTESTATION_CONTRACT_ADDRESS,
    },
  });
}
