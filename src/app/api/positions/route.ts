import { NextResponse, type NextRequest } from 'next/server';
import { getOpenPositions, getPositionHistory } from '@/lib/queries/positions';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? 'open';
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);

  try {
    const positions = status === 'open'
      ? await getOpenPositions()
      : await getPositionHistory(limit);

    return NextResponse.json({ positions, total: positions.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'QUERY_FAILED' },
      { status: 500 }
    );
  }
}
