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

export async function verifyPrivyAuthToken(authToken: string): Promise<VerifiedAuthToken> {
  const raw = process.env.PRIVY_VERIFICATION_KEY;
  if (!raw) {
    throw new Error(
      'PRIVY_VERIFICATION_KEY env var is required (Privy Dashboard -> App settings -> Verify with key)'
    );
  }
  const verificationKey = raw.replace(/\\n/g, '\n');

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
