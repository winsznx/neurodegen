import { NextResponse } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';
import { getLatestMetrics } from '@/lib/queries/metrics';
import { fetchWorkerStatusRaw } from '@/lib/services/workerAdminProxy';

const REQUIRED_ENV = [
  'BSC_RPC_URL',
  'BITQUERY_API_KEY',
  'DGRID_API_KEY',
  'NEURODEGEN_AGENT_PRIVATE_KEY',
  'ADMIN_SECRET',
  'NEXT_PUBLIC_PRIVY_APP_ID',
  'PRIVY_APP_SECRET',
  'PRIVY_AUTH_PRIVATE_KEY',
  'PRIVY_VERIFICATION_KEY',
  'NEXT_PUBLIC_PRIVY_SIGNER_ID',
] as const;

function envReport() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseAnon) missing.push('SUPABASE_ANON_KEY');
  if (!supabaseService) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { missing };
}

export async function GET() {
  const resolvedWorkerStatus = await fetchWorkerStatusRaw();
  const status = resolvedWorkerStatus.ok
    ? (resolvedWorkerStatus.status as ReturnType<typeof agentLoop.getStatus>)
    : agentLoop.getStatus();
  const { missing } = envReport();

  let databaseHealthy = false;
  let databaseError: string | null = null;
  try {
    await getLatestMetrics();
    databaseHealthy = true;
  } catch (err) {
    databaseError = err instanceof Error ? err.message : String(err);
  }

  const services = {
    perception: status.perceptionHealthy,
    cognition: status.cognitionHealthy,
    execution: status.executionHealthy,
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
      workerStatusSource: resolvedWorkerStatus.ok ? 'worker' : 'local-web-process',
      workerStatusError: resolvedWorkerStatus.ok ? null : resolvedWorkerStatus.detail,
      attestationContract: process.env.ATTESTATION_CONTRACT_ADDRESS ?? null,
      executionEnabled: process.env.NODE_ENV === 'production' ? undefined : undefined,
    },
  });
}
