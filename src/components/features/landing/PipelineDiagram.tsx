import {
  C_AMBER,
  C_AMBER_DIM,
  C_TEXT_MUTED,
  CYCLE,
  NODES,
  STEP,
  VB_H,
  VB_W,
  center,
  elbowH,
  leftMid,
  relayAnim,
  rightMid,
} from './pipeline/constants';
import {
  BindingArc,
  Chevron,
  CognitionBlock,
  Marker,
  Node,
  RelayLine,
} from './pipeline/primitives';

interface Props {
  pulseOn?: boolean;
  showBindArc?: boolean;
}

export function PipelineDiagram({ pulseOn = true, showBindArc = true }: Props) {
  const cogLeftTop = { x: NODES.cog.x, y: NODES.cog.y + 40 };
  const cogLeftMid = { x: NODES.cog.x, y: NODES.cog.y + NODES.cog.h / 2 };
  const cogLeftBot = { x: NODES.cog.x, y: NODES.cog.y + NODES.cog.h - 40 };

  const srcLines = [
    elbowH(rightMid(NODES.src_ws), cogLeftTop, 235),
    elbowH(rightMid(NODES.src_price), cogLeftMid, 235),
    elbowH(rightMid(NODES.src_mempool), cogLeftBot, 235),
  ];

  const cogOut = { x: NODES.cog.x + NODES.cog.w, y: NODES.cog.y + 50 };
  const segA = elbowH(cogOut, leftMid(NODES.commit), 605);
  const segB = { d: `M ${center(NODES.commit).x} ${NODES.commit.y + NODES.commit.h} L ${center(NODES.commit).x} ${NODES.exec.y}` };
  const segC = { d: `M ${center(NODES.exec).x} ${NODES.exec.y + NODES.exec.h} L ${center(NODES.exec).x} ${NODES.reveal.y}` };

  const outLines = [
    elbowH(rightMid(NODES.commit), leftMid(NODES.oracle), 890),
    elbowH(rightMid(NODES.exec), leftMid(NODES.ledger), 890),
    elbowH(rightMid(NODES.reveal), leftMid(NODES.proof), 890),
  ];

  const commitAnchor = { x: NODES.commit.x + NODES.commit.w, y: NODES.commit.y + 12 };
  const revealAnchor = { x: NODES.reveal.x + NODES.reveal.w, y: NODES.reveal.y + NODES.reveal.h - 12 };
  const bindD = `M ${commitAnchor.x} ${commitAnchor.y} C 1180 ${commitAnchor.y}, 1180 ${revealAnchor.y}, ${revealAnchor.x} ${revealAnchor.y}`;

  const S = (i: number) => i * STEP;

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      <defs>
        <style>{`
          @media (prefers-reduced-motion: reduce) {
            svg animate { display: none; }
          }
        `}</style>
      </defs>

      <g>
        {srcLines.map((s, i) => (
          <g key={`src-${i}`}>
            <RelayLine d={s.d} beginAt={S(0) + i * 0.18} pulseOn={pulseOn} />
            {s.markers.map((m, j) => <Marker key={j} x={m.x} y={m.y} />)}
          </g>
        ))}
      </g>
      <Chevron x={NODES.cog.x - 1} y={NODES.cog.y + 40} dir="right" />
      <Chevron x={NODES.cog.x - 1} y={NODES.cog.y + NODES.cog.h / 2} dir="right" />
      <Chevron x={NODES.cog.x - 1} y={NODES.cog.y + NODES.cog.h - 40} dir="right" />

      <g>
        <RelayLine d={segA.d} beginAt={S(2)} pulseOn={pulseOn} />
        <RelayLine d={segB.d} beginAt={S(4)} pulseOn={pulseOn} />
        <RelayLine d={segC.d} beginAt={S(6)} pulseOn={pulseOn} />
        {segA.markers.map((m, i) => <Marker key={`ha-${i}`} x={m.x} y={m.y} hot />)}
      </g>
      <Chevron x={NODES.commit.x - 1} y={center(NODES.commit).y} dir="right" hot />
      <Chevron x={center(NODES.commit).x} y={NODES.exec.y - 1} dir="down" hot />
      <Chevron x={center(NODES.exec).x} y={NODES.reveal.y - 1} dir="down" hot />

      <g>
        <RelayLine d={outLines[0].d} beginAt={S(3)} pulseOn={pulseOn} />
        <RelayLine d={outLines[1].d} beginAt={S(5)} pulseOn={pulseOn} />
        <RelayLine d={outLines[2].d} beginAt={S(7)} pulseOn={pulseOn} />
        {outLines.map((s, i) => s.markers.map((m, j) => <Marker key={`out-${i}-${j}`} x={m.x} y={m.y} />))}
      </g>
      <Chevron x={NODES.oracle.x - 1} y={center(NODES.oracle).y} dir="right" />
      <Chevron x={NODES.ledger.x - 1} y={center(NODES.ledger).y} dir="right" />
      <Chevron x={NODES.proof.x - 1} y={center(NODES.proof).y} dir="right" />

      {showBindArc && <BindingArc d={bindD} pulseOn={pulseOn} step={STEP} />}
      {showBindArc && (
        <g transform="translate(1150, 240) rotate(-90)">
          <text x="0" y="0" fontSize="9" letterSpacing="2" fill={C_AMBER_DIM} fontFamily="JetBrains Mono, monospace" textAnchor="middle">
            {pulseOn && <animate {...relayAnim('fill', C_AMBER_DIM, 'hsl(42, 96%, 68%)', S(8))} />}
            CRYPTOGRAPHIC · BINDING
          </text>
        </g>
      )}
      {showBindArc && <Marker x={commitAnchor.x} y={commitAnchor.y} hot />}
      {showBindArc && <Marker x={revealAnchor.x} y={revealAnchor.y} hot />}

      <Node n={NODES.src_ws} flashAt={pulseOn ? S(0) : null} pulseOn={pulseOn} />
      <Node n={NODES.src_price} flashAt={pulseOn ? S(0) + 0.18 : null} pulseOn={pulseOn} />
      <Node n={NODES.src_mempool} flashAt={pulseOn ? S(0) + 0.36 : null} pulseOn={pulseOn} />
      <CognitionBlock n={NODES.cog} flashAt={S(1)} pulseOn={pulseOn} />
      <Node n={NODES.commit} flashAt={pulseOn ? S(3) : null} pulseOn={pulseOn} />
      <Node n={NODES.exec} flashAt={pulseOn ? S(5) : null} pulseOn={pulseOn} />
      <Node n={NODES.reveal} flashAt={pulseOn ? S(7) : null} pulseOn={pulseOn} />
      <Node n={NODES.oracle} flashAt={pulseOn ? S(3) : null} pulseOn={pulseOn} />
      <Node n={NODES.ledger} flashAt={pulseOn ? S(5) : null} pulseOn={pulseOn} />
      <Node n={NODES.proof} flashAt={pulseOn ? S(7) : null} pulseOn={pulseOn} />

      <text x="16" y="22" fontSize="9" letterSpacing="1.4" fill={C_TEXT_MUTED} fontFamily="JetBrains Mono, monospace">◢ T0 · BEFORE TRADE</text>
      <text x="16" y={VB_H - 12} fontSize="9" letterSpacing="1.4" fill={C_TEXT_MUTED} fontFamily="JetBrains Mono, monospace">◤ T1 · AFTER TRADE</text>

      {pulseOn && (
        <g transform={`translate(0, ${VB_H - 2})`}>
          <rect x="0" y="0" width={VB_W} height="2" fill="hsl(240, 8%, 15%)" />
          <rect x="0" y="0" width="80" height="2" fill={C_AMBER} opacity="0.6">
            <animate attributeName="x" values={`0;${VB_W}`} keyTimes="0;1" dur={`${CYCLE}s`} repeatCount="indefinite" />
          </rect>
        </g>
      )}
    </svg>
  );
}
