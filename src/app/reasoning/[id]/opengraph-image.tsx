import { ImageResponse } from 'next/og';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';

export const alt = 'NeuroDegen reasoning chain';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0B0E14';
const BORDER = '#2B2F36';
const AMBER = '#F5A623';
const TEXT = '#F4F5F7';
const TEXT_MUTED = '#B1B8BF';
const TEXT_DIM = '#7E858C';
const GREEN = '#66D9A4';
const RED = '#F56565';

const ACTION_COLOR: Record<string, string> = {
  open_long: GREEN,
  open_short: RED,
  close_position: AMBER,
  adjust_parameters: '#6AA9FF',
  hold: TEXT_DIM,
};

const REGIME_COLOR: Record<string, string> = {
  quiet: TEXT_DIM,
  active: GREEN,
  retail_frenzy: AMBER,
  volatile: RED,
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReasoningOG({ params }: Props) {
  const { id } = await params;
  const graph = await getReasoningChainById(id).catch(() => null);

  const action = graph?.finalAction.action ?? 'hold';
  const pair = graph?.finalAction.pair ?? '—';
  const regime = graph?.regime ?? 'quiet';
  const confidencePct = graph ? Math.round(graph.finalAction.confidence * 100) : 0;
  const rationale = graph?.finalAction.rationale ?? 'No reasoning chain found for this id.';
  const modelCount = graph?.modelCalls.length ?? 0;
  const createdLabel = graph ? new Date(graph.createdAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';
  const actionColor = ACTION_COLOR[action] ?? TEXT;
  const regimeColor = REGIME_COLOR[regime] ?? TEXT_DIM;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: BG,
          color: TEXT,
          fontFamily: 'monospace',
          padding: 56,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(700px 400px at 80% 100%, rgba(245,166,35,0.08), transparent), radial-gradient(500px 300px at 0% 0%, rgba(245,166,35,0.05), transparent)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, zIndex: 1 }}>
          <div
            style={{
              display: 'flex',
              width: 12,
              height: 12,
              borderRadius: 999,
              background: AMBER,
            }}
          />
          <div style={{ fontSize: 18, color: TEXT_DIM, letterSpacing: 2, textTransform: 'uppercase' }}>
            neurodegen · reasoning chain
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 48, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: 90,
                fontWeight: 700,
                letterSpacing: -3,
                color: actionColor,
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              {action.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 56, color: TEXT, letterSpacing: -1 }}>{pair}</div>
          </div>

          <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <Pill label="confidence" value={`${confidencePct}%`} valueColor={actionColor} />
            <Pill label="regime" value={regime} valueColor={regimeColor} />
            <Pill label="model calls" value={String(modelCount)} valueColor={TEXT} />
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: TEXT_MUTED,
              maxWidth: 1080,
              lineHeight: 1.35,
              borderLeft: `3px solid ${AMBER}`,
              paddingLeft: 20,
            }}
          >
            {rationale.length > 220 ? rationale.slice(0, 217) + '…' : rationale}
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 1,
            fontSize: 16,
            color: TEXT_DIM,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <span>graph</span>
            <span style={{ color: TEXT_MUTED }}>{id.slice(0, 8)}…{id.slice(-6)}</span>
          </div>
          <div>{createdLabel}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}

function Pill({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '10px 20px',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ fontSize: 14, color: TEXT_DIM, letterSpacing: 1.5, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 32, color: valueColor, fontWeight: 600, textTransform: 'uppercase' }}>
        {value}
      </div>
    </div>
  );
}
