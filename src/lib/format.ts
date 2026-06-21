/**
 * Shared consumer-grade formatters used across the web UI AND the Telegram
 * alerter. Same numbers everywhere; same time strings everywhere. Anywhere
 * a raw number, address, or ISO timestamp appears in user-facing output,
 * it should be passed through one of these.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6,
});

const NUM_COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

const REL = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** Format USD: $1,234.56. Compact (>1M) returns $1.2M. */
export function fmtUSD(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (opts.compact && Math.abs(value) >= 1_000_000) return USD_COMPACT.format(value);
  return USD.format(value);
}

/** Format a percentage value (`0.123` → `+12.30%`). Signed + emoji prefix optional. */
export function fmtPct(
  value: number | null | undefined,
  opts: { signed?: boolean; emoji?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const decimals = opts.decimals ?? 2;
  const pct = (value * 100).toFixed(decimals);
  const sign = opts.signed !== false && value > 0 ? '+' : '';
  const emoji = opts.emoji ? (value > 0 ? '🟢 ' : value < 0 ? '🔴 ' : '⚪️ ') : '';
  return `${emoji}${sign}${pct}%`;
}

/** Format a raw number: 1,234.56. Compact (>10k) returns 1.2k. */
export function fmtNum(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (opts.compact && Math.abs(value) >= 10_000) return NUM_COMPACT.format(value);
  return NUM.format(value);
}

/** Truncate an EVM address or tx hash: 0x1234…abcd. */
export function fmtAddr(hex: string | null | undefined, opts: { head?: number; tail?: number } = {}): string {
  if (!hex || typeof hex !== 'string') return '-';
  if (!hex.startsWith('0x')) return hex;
  const head = opts.head ?? 6;
  const tail = opts.tail ?? 4;
  if (hex.length <= head + tail + 2) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

/** Human-relative time: "2m ago", "in 3h", "yesterday". */
export function fmtRel(when: number | string | Date | null | undefined, now = Date.now()): string {
  if (when === null || when === undefined) return '-';
  const ts = typeof when === 'number' ? when : new Date(when).getTime();
  if (!Number.isFinite(ts)) return '-';
  const diffMs = ts - now;
  const abs = Math.abs(diffMs);
  // Pick the largest unit where |value| ≥ 1.
  const seconds = diffMs / 1000;
  if (abs < 60_000) return REL.format(Math.round(seconds), 'second');
  if (abs < 3_600_000) return REL.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400_000) return REL.format(Math.round(seconds / 3600), 'hour');
  if (abs < 604_800_000) return REL.format(Math.round(seconds / 86_400), 'day');
  if (abs < 2_592_000_000) return REL.format(Math.round(seconds / 604_800), 'week');
  if (abs < 31_536_000_000) return REL.format(Math.round(seconds / 2_592_000), 'month');
  return REL.format(Math.round(seconds / 31_536_000), 'year');
}

/** Format a trade side with directional emoji. */
export function fmtSide(side: 'long' | 'short' | 'spot' | string): string {
  if (side === 'long') return '📈 LONG';
  if (side === 'short') return '📉 SHORT';
  if (side === 'spot') return '⚪️ SPOT';
  return side.toUpperCase();
}

/** Build a BscScan transaction URL. */
export function bscScanTx(hash: string): string {
  return `https://bscscan.com/tx/${hash}`;
}

/** Build a BscScan address URL. */
export function bscScanAddr(addr: string): string {
  return `https://bscscan.com/address/${addr}`;
}
