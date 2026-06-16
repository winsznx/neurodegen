import { ImageResponse } from 'next/og';
import { getSessionById } from '@/lib/queries/sessions';

// Railway-only deployment: stay on Node.js. Edge runtime is Vercel-specific
// and the Edge OG image generator carries Vercel platform assumptions.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getSessionById(id).catch(() => null);
  const headline = session
    ? `${session.finalAction.action.toUpperCase()} · ${session.finalAction.tokenSymbol ?? 'NO TOKEN'}`
    : 'Session not found';
  const regime = session ? session.regime : 'unknown';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0a0a',
          color: '#f5f5f5',
          padding: '64px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 28, height: 28, background: '#f59e0b', borderRadius: 2 }} />
          <div style={{ fontSize: 24, letterSpacing: 4 }}>NEURODEGEN V2</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 24, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 3 }}>
            session #{session?.sessionNumber ?? '?'} · regime {regime}
          </div>
          <div style={{ fontSize: 96, lineHeight: 1.05, fontWeight: 700 }}>{headline}</div>
          <div style={{ fontSize: 22, color: '#9ca3af', maxWidth: 1000 }}>
            {session?.finalAction.plainLanguageExplanation ?? 'No session for this id.'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 18 }}>
          <span>neurodegen.xyz · proof of reasoning, on BNB Chain</span>
          <span>self-custody · twak</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
