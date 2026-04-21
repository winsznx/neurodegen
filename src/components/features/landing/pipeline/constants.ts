export const VB_W = 1200;
export const VB_H = 520;
export const STEP = 1.2;
export const FLASH = 1.8;
export const CYCLE = STEP * 10;

export const C_AMBER = 'hsl(35, 92%, 52%)';
export const C_AMBER_HOT = 'hsl(42, 96%, 68%)';
export const C_AMBER_DIM = 'hsl(35, 60%, 38%)';
export const C_AMBER_MUTE = 'hsl(35, 40%, 28%)';
export const C_NEUTRAL = 'hsl(240, 8%, 22%)';
export const C_TEXT = 'hsl(40, 18%, 92%)';
export const C_TEXT_MUTED = 'hsl(35, 6%, 42%)';
export const C_TEXT_DIM = 'hsl(35, 6%, 62%)';
export const C_SURFACE = 'hsl(240, 10%, 11%)';

export interface NodeGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'input' | 'output' | 'hot-filled' | 'hot-outline' | 'cognition';
  title?: string;
  meta?: string;
  sub?: string;
}

export const NODES: Record<string, NodeGeom> = {
  src_ws: { x: 40, y: 70, w: 140, h: 44, kind: 'input', title: 'Four.meme WS', meta: 'SOURCE', sub: 'token.launched' },
  src_price: { x: 40, y: 190, w: 140, h: 44, kind: 'input', title: 'Market feed', meta: 'SOURCE', sub: 'px · depth · vol' },
  src_mempool: { x: 40, y: 340, w: 140, h: 44, kind: 'input', title: 'BSC mempool', meta: 'SOURCE', sub: 'pending tx' },
  cog: { x: 290, y: 140, w: 260, h: 230, kind: 'cognition' },
  commit: { x: 660, y: 90, w: 180, h: 60, kind: 'hot-filled', title: 'reasoningHash', meta: 'ON-CHAIN COMMIT', sub: 'keccak256 · 0xe21f…7dc4' },
  exec: { x: 660, y: 230, w: 180, h: 60, kind: 'hot-outline', title: 'MYX · createIncrease', meta: 'EXECUTION', sub: 'perp order · BSC' },
  reveal: { x: 660, y: 390, w: 180, h: 60, kind: 'hot-filled', title: 'txHash ⊕ reasoningHash', meta: 'ON-CHAIN REVEAL', sub: 'ExecutionRevealed' },
  oracle: { x: 940, y: 90, w: 180, h: 44, kind: 'output', title: 'BscScan verify', meta: 'PUBLIC', sub: 'anyone can audit' },
  ledger: { x: 940, y: 230, w: 180, h: 44, kind: 'output', title: 'MYX orderbook', meta: 'VENUE', sub: 'order settled' },
  proof: { x: 940, y: 390, w: 180, h: 44, kind: 'output', title: 'Proof receipt', meta: 'EXPORT', sub: '.json · .txt' },
};

export const center = (n: NodeGeom) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
export const rightMid = (n: NodeGeom) => ({ x: n.x + n.w, y: n.y + n.h / 2 });
export const leftMid = (n: NodeGeom) => ({ x: n.x, y: n.y + n.h / 2 });

export interface ElbowPath { d: string; markers: { x: number; y: number }[] }

export function elbowH(a: { x: number; y: number }, b: { x: number; y: number }, midX: number): ElbowPath {
  return {
    d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
    markers: [{ x: midX, y: a.y }, { x: midX, y: b.y }],
  };
}

export interface RelayAnimProps {
  attributeName: string;
  values: string;
  keyTimes: string;
  keySplines?: string;
  calcMode?: string;
  dur: string;
  repeatCount: string;
  fill: string;
}

export function relayAnim(attr: string, ambient: string, bright: string, beginAt: number): RelayAnimProps {
  const t0 = beginAt / CYCLE;
  const t1 = Math.min(1, (beginAt + 0.05) / CYCLE);
  const t2 = Math.min(1, (beginAt + FLASH) / CYCLE);
  const ktRaw = [0, t0, t1, t2, 1];
  const valsRaw = [ambient, bright, bright, ambient, ambient];
  const keyTimes: number[] = [];
  const values: string[] = [];
  for (let i = 0; i < ktRaw.length; i++) {
    if (i === 0 || ktRaw[i] > ktRaw[i - 1]) {
      keyTimes.push(ktRaw[i]);
      values.push(valsRaw[i]);
    }
  }
  return {
    attributeName: attr,
    values: values.join(';'),
    keyTimes: keyTimes.join(';'),
    keySplines: keyTimes.length === 5 ? '0 0 1 1; 0 0 1 1; 0.3 0 0.6 1; 0 0 1 1' : undefined,
    calcMode: keyTimes.length === 5 ? 'spline' : 'linear',
    dur: `${CYCLE}s`,
    repeatCount: 'indefinite',
    fill: 'remove',
  };
}
