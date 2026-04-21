import { ImageResponse } from 'next/og';

export const alt = 'NeuroDegen — autonomous on-chain execution agent';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0B0E14',
          color: '#E5E7EB',
          fontFamily: 'monospace',
          padding: 64,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(800px 400px at 85% 110%, rgba(102,217,164,0.10), transparent), radial-gradient(600px 300px at 10% -10%, rgba(102,217,164,0.06), transparent)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, zIndex: 1 }}>
          <LogoBlock scale={1.9} />
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: '#7E858C',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            neurodegen · v0.1
          </div>
        </div>

        <div
          style={{
            marginTop: 56,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -2, color: '#F4F5F7' }}>
            on-chain execution agent
          </div>
          <div style={{ fontSize: 30, color: '#B1B8BF', maxWidth: 960 }}>
            four.meme signals · multi-LLM reasoning · MYX perps · verifiable on-chain proof
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          {['BNB Chain', 'DGrid', 'MYX Finance', 'Pieverse', 'Privy Copy-Trade'].map((label) => (
            <div
              key={label}
              style={{
                display: 'flex',
                border: '1px solid #2B2F36',
                background: 'rgba(102,217,164,0.04)',
                color: '#B1B8BF',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 20,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}

function LogoBlock({ scale = 1 }: { scale?: number }) {
  const unit = 4 * scale;
  return (
    <div
      style={{
        width: 16 * unit,
        height: 16 * unit,
        background: '#0B0E14',
        border: '1px solid #2B2F36',
        borderRadius: 3.5 * unit,
        position: 'relative',
        display: 'flex',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 3 * unit,
          top: 4.5 * unit,
          width: 8 * unit,
          height: 0.75 * unit,
          background: '#E5E7EB',
          borderRadius: 2,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 3 * unit,
          top: 7 * unit,
          width: 5.5 * unit,
          height: 0.75 * unit,
          background: '#B1B8BF',
          borderRadius: 2,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 3 * unit,
          top: 9.5 * unit,
          width: 3.5 * unit,
          height: 0.75 * unit,
          background: '#7E858C',
          borderRadius: 2,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 12 * unit,
          top: 4.5 * unit,
          width: unit,
          height: 6.5 * unit,
          background: '#66D9A4',
          borderRadius: 2,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 12.5 * unit,
          top: 11.75 * unit,
          width: unit,
          height: unit,
          background: '#66D9A4',
          borderRadius: '50%',
          display: 'flex',
        }}
      />
    </div>
  );
}
