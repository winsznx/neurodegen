import { NextResponse } from 'next/server';
import { getSessionById } from '@/lib/queries/sessions';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ session: null }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { session: null, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
