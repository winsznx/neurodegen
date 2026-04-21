import { NextResponse, type NextRequest } from 'next/server';
import { getRecentReasoningChains } from '@/lib/queries/reasoningChains';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Number(searchParams.get('limit') ?? 10), 50);
  const offset = Number(searchParams.get('offset') ?? 0);

  try {
    const chains = await getRecentReasoningChains(limit + offset);
    const sliced = chains.slice(offset, offset + limit);
    return NextResponse.json({ chains: sliced, total: chains.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'QUERY_FAILED' },
      { status: 500 }
    );
  }
}
