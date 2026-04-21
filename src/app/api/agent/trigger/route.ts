import { NextResponse, type NextRequest } from 'next/server';
import { agentLoop } from '@/lib/services/agentLoop';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Admin-Secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'ADMIN_REQUIRED' },
      { status: 403 }
    );
  }

  try {
    const graph = await agentLoop.runSingleCycle();
    return NextResponse.json({
      reasoningGraphId: graph.graphId,
      action: graph.finalAction.action,
      executed: graph.executionResult?.executed ?? false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'CYCLE_FAILED' },
      { status: 500 }
    );
  }
}
