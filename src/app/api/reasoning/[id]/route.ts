import { NextResponse, type NextRequest } from 'next/server';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: 'Invalid reasoning chain ID format', code: 'INVALID_ID' },
      { status: 400 }
    );
  }

  try {
    const chain = await getReasoningChainById(id);
    if (!chain) {
      return NextResponse.json(
        { error: 'Reasoning chain not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    return NextResponse.json(chain);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'QUERY_FAILED' },
      { status: 500 }
    );
  }
}
