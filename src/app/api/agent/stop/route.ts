import type { NextRequest } from 'next/server';
import { proxyAdminRequest } from '@/lib/services/workerAdminProxy';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, '/admin/stop');
}
