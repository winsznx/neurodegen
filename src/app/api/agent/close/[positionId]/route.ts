import { NextResponse, type NextRequest } from 'next/server';
import { proxyAdminRequest } from '@/lib/services/workerAdminProxy';

export const dynamic = 'force-dynamic';

const POSITION_ID_RE = /^[0-9a-fA-F-]{36}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params;
  if (!POSITION_ID_RE.test(positionId)) {
    return NextResponse.json({ error: 'invalid position id', code: 'BAD_REQUEST' }, { status: 400 });
  }
  return proxyAdminRequest(request, `/admin/close/${positionId}`);
}
