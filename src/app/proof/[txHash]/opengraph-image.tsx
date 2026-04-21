import { ImageResponse } from 'next/og';
import { getPositionByEntryTxHash } from '@/lib/queries/positions';
import { getReasoningChainById } from '@/lib/queries/reasoningChains';

export const alt = 'NeuroDegen on-chain trade proof';
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

interface Props {
  params: Promise<{ txHash: string }>;
}

function shorten(hash: string, head = 10, tail = 6): string {
  if (!hash || hash.length < head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export default async function ProofOG({ params }: Props) {
  const { txHash } = await params;
  const normalized = txHash.toLowerCase();
  const position = await getPositionByEntryTxHash(normalized).catch(() => null);
  const graph = position ? await getReasoningChainById(position.reasoningGraphId).catch(() => null) : null;

  if (!position) {
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
            padding: 64,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 28, color: AMBER, letterSpacing: 2, textTransform: 'uppercase' }}>
            proof · not found
          </div>
          <div style={{ fontSize: 56, color: TEXT, marginTop: 24, letterSpacing: -1 }}>
            {shorten(normalized, 14, 8)}
          </div>
          <div style={{ fontSize: 22, color: TEXT_DIM, marginTop: 20, textAlign: 'center', maxWidth: 900 }}>
            No NeuroDegen position recorded against this tx hash.
          </div>
        </div>
      ),
      { ...size }
    );
  }

  const sideColor = position.isLong ? GREEN : RED;
  const sideLabel = position.isLong ? 'LONG' : 'SHORT';
  const confidencePct = graph ? Math.round(graph.finalAction.confidence * 100) : null;
  const regime = graph?.regime ?? null;
  const notional = position.collateralUsd * position.leverage;

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
            background: position.isLong
              ? 'radial-gradient(700px 400px at 80% 100%, rgba(102,217,164,0.08), transparent), radial-gradient(500px 300px at 0% 0%, rgba(245,166,35,0.05), transparent)'
              : 'radial-gradient(700px 400px at 80% 100%, rgba(245,101,101,0.08), transparent), radial-gradient(500px 300px at 0% 0%, rgba(245,166,35,0.05), transparent)',
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
          <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 999, background: AMBER }} />
          <div style={{ fontSize: 18, color: TEXT_DIM, letterSpacing: 2, textTransform: 'uppercase' }}>
            neurodegen · on-chain proof
          </div>
          <div style={{ fontSize: 14, color: TEXT_DIM, marginLeft: 'auto' }}>
            commit · reveal · verified
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 48, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: 108,
                fontWeight: 700,
                letterSpacing: -4,
                color: sideColor,
                lineHeight: 1,
              }}
            >
              {sideLabel}
            </div>
            <div style={{ fontSize: 72, color: TEXT, letterSpacing: -2 }}>{position.pair}</div>
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Pill label="collateral" value={formatUsd(position.collateralUsd)} valueColor={TEXT} />
            <Pill label="leverage" value={`${position.leverage}x`} valueColor={AMBER} />
            <Pill label="notional" value={formatUsd(notional)} valueColor={TEXT} />
            <Pill label="entry" value={formatUsd(position.entryPrice)} valueColor={TEXT_MUTED} />
            {confidencePct !== null ? (
              <Pill label="confidence" value={`${confidencePct}%`} valueColor={sideColor} />
            ) : null}
            {regime ? (
              <Pill label="regime" value={regime} valueColor={TEXT_MUTED} />
            ) : null}
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
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 20,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <span>tx</span>
            <span style={{ color: TEXT_MUTED }}>{shorten(normalized, 14, 10)}</span>
          </div>
          <div>verify on bscscan</div>
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
      <div style={{ fontSize: 28, color: valueColor, fontWeight: 600, textTransform: 'uppercase' }}>
        {value}
      </div>
    </div>
  );
}
