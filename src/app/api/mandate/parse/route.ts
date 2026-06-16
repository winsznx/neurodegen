import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DEFAULT_MANDATE, type MandateConfig } from '@/types/mandate';

export const dynamic = 'force-dynamic';

const Body = z.object({
  maxDrawdownPct: z.number().min(0.05).max(0.28).optional(),
  maxPositionPct: z.number().min(0.01).max(0.2).optional(),
  dailyLossCapPct: z.number().min(0.01).max(0.15).optional(),
  consecutiveLossHalt: z.number().int().min(1).max(10).optional(),
  riskLevel: z
    .union([z.literal('conservative'), z.literal('moderate'), z.literal('aggressive')])
    .optional(),
  signalPriority: z
    .union([z.literal('narrative'), z.literal('quant'), z.literal('balanced')])
    .optional(),
  crashProtocolFGThreshold: z.number().int().min(10).max(50).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid mandate', details: parsed.error.message }, { status: 400 });
  }
  const mandate: MandateConfig = { ...DEFAULT_MANDATE, ...parsed.data };
  return NextResponse.json({ mandate });
}
