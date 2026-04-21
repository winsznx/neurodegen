import { PrivyClient, verifyAuthToken, type AuthorizationContext } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import type { Hex, LocalAccount } from 'viem';

let client: PrivyClient | null = null;

function getAppId(): string {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
  if (!id) throw new Error('NEXT_PUBLIC_PRIVY_APP_ID (or PRIVY_APP_ID) env var is required');
  return id;
}

function getAppSecret(): string {
  const secret = process.env.PRIVY_APP_SECRET;
  if (!secret) throw new Error('PRIVY_APP_SECRET env var is required');
  return secret;
}

function getAuthPrivateKey(): string {
  const key = process.env.PRIVY_AUTH_PRIVATE_KEY;
  if (!key) throw new Error('PRIVY_AUTH_PRIVATE_KEY env var is required for session signing');
  return key;
}

export function getPrivyClient(): PrivyClient {
  if (client) return client;
  client = new PrivyClient({
    appId: getAppId(),
    appSecret: getAppSecret(),
  });
  return client;
}

export interface VerifiedAuthToken {
  userId: string;
  appId: string;
  issuedAt: number;
  expiresAt: number;
}

function stripWrappers(raw: string): string {
  let s = raw.trim();
  // Strip surrounding matching quotes (common when pasted from JSON or a .env file with quotes)
  while (
    s.length > 1 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function normalizePemKey(raw: string): string {
  const cleaned = stripWrappers(raw);

  const withNewlines = cleaned
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // If it already has newlines and canonical PEM markers, pass through untouched.
  if (withNewlines.includes('\n') && /-----BEGIN [A-Z0-9 ]+-----/.test(withNewlines)) {
    return withNewlines;
  }

  // Otherwise we expect a single-line form: reconstruct with 64-char body lines.
  const match = withNewlines.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/);
  if (!match) {
    const preview = withNewlines.slice(0, 60).replace(/\s+/g, ' ');
    throw new Error(
      `PRIVY_VERIFICATION_KEY is not in PEM format. Got ${withNewlines.length} chars starting with: "${preview}". ` +
        'Expected -----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY----- from Privy Dashboard → App Settings → Verification Key. ' +
        'If you pasted a quoted value, remove surrounding quotes; make sure both BEGIN and END markers use exactly five dashes on each side.'
    );
  }
  const label = match[1].trim();
  const body = match[2].replace(/\s+/g, '');
  const chunks = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN ${label}-----\n${chunks.join('\n')}\n-----END ${label}-----`;
}

export async function verifyPrivyAuthToken(authToken: string): Promise<VerifiedAuthToken> {
  const raw = process.env.PRIVY_VERIFICATION_KEY;
  if (!raw) {
    throw new Error(
      'PRIVY_VERIFICATION_KEY env var is required (Privy Dashboard → App Settings → Verification Key)'
    );
  }
  let verificationKey: string;
  try {
    verificationKey = normalizePemKey(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PRIVY_VERIFICATION_KEY normalization failed: ${msg}`);
  }

  try {
    const result = await verifyAuthToken({
      auth_token: authToken,
      app_id: getAppId(),
      verification_key: verificationKey,
    });
    return {
      userId: result.user_id,
      appId: result.app_id,
      issuedAt: result.issued_at,
      expiresAt: result.expiration,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('keyData') || msg.toLowerCase().includes('invalid key')) {
      throw new Error(
        `Privy token verification failed: ${msg}. The PEM key passed normalization but node:crypto rejected it. ` +
          `This usually means the BEGIN/END markers or base64 body are corrupted in the Vercel env value. ` +
          `Re-copy from Privy Dashboard → App Settings → Verification Key without surrounding quotes, paste into Vercel env as-is (multiline or single-line both work).`
      );
    }
    throw err;
  }
}

export function buildAuthorizationContext(): AuthorizationContext {
  return {
    authorization_private_keys: [getAuthPrivateKey()],
  };
}

export interface UserWalletIdentity {
  walletId: string;
  address: Hex;
}

export function buildPrivyViemAccount(identity: UserWalletIdentity): LocalAccount {
  return createViemAccount(getPrivyClient(), {
    walletId: identity.walletId,
    address: identity.address,
    authorizationContext: buildAuthorizationContext(),
  });
}
