import { NextResponse } from 'next/server';
import { clearServerSessionCookie } from '@/lib/auth/session';

export async function POST() {
  await clearServerSessionCookie();
  return NextResponse.json({ loggedOut: true });
}
