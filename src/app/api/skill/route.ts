import { NextResponse, type NextRequest } from 'next/server';
import { PieverseSkillWrapper } from '@/lib/services/monetization/skillWrapper';
import { PaymentHandler } from '@/lib/services/monetization/paymentHandler';
import { ENABLE_PIEVERSE_SKILL } from '@/config/features';

const skillWrapper = new PieverseSkillWrapper();
const paymentHandler = new PaymentHandler();

export async function POST(request: NextRequest) {
  if (!ENABLE_PIEVERSE_SKILL) {
    return NextResponse.json(
      { error: 'Pieverse skill is disabled', code: 'SKILL_DISABLED' },
      { status: 503 }
    );
  }

  let body: { command?: string; text?: string; confirmed?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const input = body.command ?? body.text ?? '';
  const parsed = skillWrapper.parseCommand(input);

  if (parsed.requiresPayment) {
    const proof = request.headers.get('X-Payment-Proof') ?? '';
    if (!proof) {
      const challenge = paymentHandler.buildChallenge(parsed.command);
      return NextResponse.json(challenge.body, {
        status: challenge.status,
        headers: challenge.headers,
      });
    }

    const verification = await paymentHandler.verifyPayment(proof);
    if (!verification.valid) {
      const challenge = paymentHandler.buildChallenge(parsed.command);
      return NextResponse.json(
        {
          ...challenge.body,
          error: `payment proof rejected: ${verification.reason}`,
        },
        { status: challenge.status, headers: challenge.headers }
      );
    }
  }

  const result = await skillWrapper.executeCommand(parsed.command, true, {
    confirmed: body.confirmed === true,
  });

  return NextResponse.json({
    response: result.response,
    data: result.data,
    command: parsed.command,
  });
}

export async function GET() {
  return NextResponse.json({
    skill: 'neurodegen',
    version: '0.1.0',
    protocol: 'x402',
    commands: ['monitor', 'positions', 'reasoning', 'close-all', 'status'],
    paidCommands: ['monitor'],
    chainId: 56,
    paymentToken: 'pieUSD',
    paymentTokenAddress: process.env.PIEVERSE_PIEUSD_ADDRESS ?? '0x0e63b9c287e32a05e6b9ab8ee8df88a2760225a9',
  });
}
