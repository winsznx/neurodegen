import { NextResponse } from 'next/server';
import { getRecentSessions } from '@/lib/queries/sessions';
import { getPositionHistory } from '@/lib/queries/positions';
import type { JournalEntry } from '@/types/monetization';

export const dynamic = 'force-dynamic';

function convictionFor(confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (confidence >= 0.7) return 'HIGH';
  if (confidence >= 0.45) return 'MEDIUM';
  return 'LOW';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10), 1), 100);
  try {
    const [sessions, positions] = await Promise.all([
      getRecentSessions(limit),
      getPositionHistory(limit * 2),
    ]);
    const positionBySession = new Map(positions.map((p) => [p.sessionId, p]));
    const entries: JournalEntry[] = sessions.map((s) => {
      const p = positionBySession.get(s.sessionId);
      return {
        sessionId: s.sessionId,
        sessionNumber: s.sessionNumber,
        createdAt: s.createdAt,
        regime: s.regime,
        fearGreedAtSession: s.fearGreedAtSession,
        action: s.finalAction.action,
        tokenSymbol: s.finalAction.tokenSymbol,
        committeeConviction: convictionFor(s.finalAction.confidence),
        dissentDetected: s.dissentResult.dissentDetected,
        pnlPct: p?.pnlPct ?? null,
        pnlUSD: p?.pnlUSD ?? null,
        holdDurationMinutes:
          p?.openedAt && p?.closedAt
            ? Math.round(
                (new Date(p.closedAt).getTime() - new Date(p.openedAt).getTime()) / 60_000,
              )
            : null,
        exitReason: p?.exitReason ?? null,
        bscscanUrl: p?.twakTxHash ? `https://bscscan.com/tx/${p.twakTxHash}` : null,
      };
    });
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json(
      { entries: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
