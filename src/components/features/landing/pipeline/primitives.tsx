import {
  C_AMBER,
  C_AMBER_DIM,
  C_AMBER_HOT,
  C_AMBER_MUTE,
  C_NEUTRAL,
  C_SURFACE,
  C_TEXT,
  C_TEXT_MUTED,
  type NodeGeom,
  type RelayAnimProps,
  relayAnim,
} from './constants';

export function Marker({ x, y, hot }: { x: number; y: number; hot?: boolean }) {
  return (
    <rect
      x={x - 3}
      y={y - 3}
      width={6}
      height={6}
      fill={hot ? C_AMBER : C_SURFACE}
      stroke={hot ? C_AMBER : C_NEUTRAL}
      strokeWidth="1"
    />
  );
}

export function Chevron({ x, y, dir = 'right', hot = false, size = 7 }: {
  x: number;
  y: number;
  dir?: 'right' | 'down' | 'left';
  hot?: boolean;
  size?: number;
}) {
  const color = hot ? C_AMBER : 'hsl(35, 6%, 42%)';
  const p =
    dir === 'right'
      ? `M ${x - size} ${y - size} L ${x} ${y} L ${x - size} ${y + size}`
      : dir === 'down'
      ? `M ${x - size} ${y - size} L ${x} ${y} L ${x + size} ${y - size}`
      : `M ${x + size} ${y - size} L ${x} ${y} L ${x + size} ${y + size}`;
  return <path d={p} fill="none" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />;
}

function SmilAnim(props: RelayAnimProps) {
  return <animate {...(props as unknown as Record<string, string>)} />;
}

export function RelayLine({ d, beginAt, pulseOn, ambient = C_NEUTRAL, bright = C_AMBER }: {
  d: string;
  beginAt: number;
  pulseOn: boolean;
  ambient?: string;
  bright?: string;
}) {
  return (
    <path d={d} stroke={ambient} strokeWidth="1.25" fill="none" strokeDasharray="3 3" strokeLinecap="round">
      {pulseOn && <SmilAnim {...relayAnim('stroke', ambient, bright, beginAt)} />}
    </path>
  );
}

export function Node({ n, flashAt, pulseOn }: { n: NodeGeom; flashAt: number | null; pulseOn: boolean }) {
  const isHotFilled = n.kind === 'hot-filled';
  const isHotOutline = n.kind === 'hot-outline';
  const isInput = n.kind === 'input';
  const isOutput = n.kind === 'output';

  const ambFill = isHotFilled
    ? C_AMBER_DIM
    : isHotOutline || isInput
    ? C_SURFACE
    : isOutput
    ? 'transparent'
    : C_SURFACE;
  const ambStroke = isHotFilled ? C_AMBER_DIM : isHotOutline ? C_AMBER_MUTE : C_NEUTRAL;
  const ambTitle = isHotFilled ? 'hsl(35, 25%, 18%)' : C_TEXT;
  const canFlash = pulseOn && flashAt !== null;

  const flashFill = isHotFilled ? C_AMBER_HOT : isHotOutline ? C_SURFACE : 'hsl(35, 40%, 14%)';
  const flashTitle = isHotFilled ? 'hsl(30, 40%, 8%)' : C_AMBER_HOT;
  const metaAmbient = isHotFilled ? C_AMBER_DIM : C_TEXT_MUTED;
  const subColor = isHotFilled ? 'hsl(35, 25%, 22%)' : C_TEXT_MUTED;

  return (
    <g>
      {canFlash && flashAt !== null && (
        <rect x={n.x - 10} y={n.y - 10} width={n.w + 20} height={n.h + 20} fill={C_AMBER} opacity="0" rx="6">
          <SmilAnim {...relayAnim('opacity', '0', '0.28', flashAt)} />
        </rect>
      )}
      <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={ambFill} stroke={ambStroke} strokeWidth="1" rx="3">
        {canFlash && flashAt !== null && <SmilAnim {...relayAnim('fill', ambFill, flashFill, flashAt)} />}
        {canFlash && flashAt !== null && <SmilAnim {...relayAnim('stroke', ambStroke, C_AMBER_HOT, flashAt + 0.001)} />}
      </rect>
      {n.meta && (
        <text x={n.x} y={n.y - 8} fontSize="9" letterSpacing="1.2" fill={metaAmbient} fontFamily="JetBrains Mono, monospace">
          {canFlash && flashAt !== null && <SmilAnim {...relayAnim('fill', metaAmbient, C_AMBER_HOT, flashAt)} />}
          {n.meta}
        </text>
      )}
      {n.title && (
        <text
          x={n.x + 12}
          y={n.y + (n.sub ? 22 : n.h / 2 + 4)}
          fontSize="12"
          fill={ambTitle}
          fontFamily="JetBrains Mono, monospace"
          fontWeight={isHotFilled ? 600 : 500}
        >
          {canFlash && flashAt !== null && <SmilAnim {...relayAnim('fill', ambTitle, flashTitle, flashAt)} />}
          {n.title}
        </text>
      )}
      {n.sub && (
        <text x={n.x + 12} y={n.y + 38} fontSize="10" fill={subColor} fontFamily="JetBrains Mono, monospace">
          {n.sub}
        </text>
      )}
    </g>
  );
}

export function CognitionBlock({ n, flashAt, pulseOn }: { n: NodeGeom; flashAt: number; pulseOn: boolean }) {
  const canFlash = pulseOn && flashAt !== null;
  const rows = [
    { k: 'Claude', v: '/v1/messages', fmt: 'DGRID NATIVE' },
    { k: 'GPT-4o', v: '/v1/chat/completions', fmt: 'OPENAI FMT' },
    { k: 'DeepSeek', v: '/v1/chat/completions', fmt: 'OPENAI FMT' },
  ];
  return (
    <g>
      {canFlash && (
        <rect x={n.x - 10} y={n.y - 10} width={n.w + 20} height={n.h + 20} fill={C_AMBER} opacity="0" rx="8">
          <SmilAnim {...relayAnim('opacity', '0', '0.22', flashAt)} />
        </rect>
      )}
      <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={C_SURFACE} rx="4" />
      <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={C_AMBER} opacity="0.04" rx="4" />
      <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="none" stroke={C_AMBER_MUTE} strokeWidth="1" strokeDasharray="3 3" rx="4">
        {canFlash && <SmilAnim {...relayAnim('stroke', C_AMBER_MUTE, C_AMBER_HOT, flashAt)} />}
      </rect>
      <text x={n.x} y={n.y - 8} fontSize="9" letterSpacing="1.2" fill={C_AMBER_DIM} fontFamily="JetBrains Mono, monospace">
        {canFlash && <SmilAnim {...relayAnim('fill', C_AMBER_DIM, C_AMBER_HOT, flashAt)} />}
        COGNITION · 3 LLMS · REASONING GRAPH
      </text>
      {rows.map((r, i) => {
        const rowY = n.y + 28 + i * 58;
        return (
          <g key={r.k}>
            <line x1={n.x + 16} y1={rowY + 28} x2={n.x + n.w - 16} y2={rowY + 28} stroke="hsl(240, 8%, 15%)" strokeWidth="1" />
            <text x={n.x + 16} y={rowY + 8} fontSize="9" letterSpacing="1" fill={C_TEXT_MUTED} fontFamily="JetBrains Mono, monospace">
              {`0${i + 1} · ${r.fmt}`}
            </text>
            <text x={n.x + 16} y={rowY + 22} fontSize="12" fill={C_TEXT} fontFamily="JetBrains Mono, monospace">{r.k}</text>
            <text x={n.x + n.w - 16} y={rowY + 22} fontSize="10" fill="hsl(35, 6%, 62%)" textAnchor="end" fontFamily="JetBrains Mono, monospace">
              {r.v}
            </text>
          </g>
        );
      })}
      <text x={n.x + 16} y={n.y + n.h - 10} fontSize="9" letterSpacing="1" fill={C_AMBER_DIM} fontFamily="JetBrains Mono, monospace">
        {canFlash && <SmilAnim {...relayAnim('fill', C_AMBER_DIM, C_AMBER_HOT, flashAt)} />}
        ⇣ keccak256(graph) → reasoningHash
      </text>
    </g>
  );
}

export function BindingArc({ d, pulseOn, step }: { d: string; pulseOn: boolean; step: number }) {
  const CYCLE = step * 10;
  return (
    <>
      <path d={d} stroke={C_AMBER_MUTE} strokeWidth="1" fill="none" strokeDasharray="2 4" opacity="0.7">
        {pulseOn && <SmilAnim {...relayAnim('stroke', C_AMBER_MUTE, C_AMBER_HOT, step * 8)} />}
      </path>
      {pulseOn && (
        <path d={d} stroke={C_AMBER_HOT} strokeWidth="1.5" fill="none" pathLength={100} strokeDasharray="100 100" strokeDashoffset="100">
          <animate
            attributeName="stroke-dashoffset"
            values="100;100;0;0;100"
            keyTimes={`0;${(step * 8) / CYCLE};${(step * 8.5) / CYCLE};${(step * 9.5) / CYCLE};1`}
            dur={`${CYCLE}s`}
            repeatCount="indefinite"
          />
        </path>
      )}
    </>
  );
}
