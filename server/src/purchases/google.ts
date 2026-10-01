import { JWT } from 'google-auth-library';
import { env } from '../env';

/**
 * Verify a Google Play purchase with the Android Publisher API.
 * Subscriptions and one-time products use different endpoints; we pick based on
 * whether the SKU is a subscription (prefix "pro_").
 */

let cachedClient: JWT | null = null;

function getClient(): JWT {
  if (cachedClient) return cachedClient;
  const raw = env.googleServiceAccountJson.trim();
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };
  cachedClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  return cachedClient;
}

export interface VerifyResult {
  valid: boolean;
  expiresAt: Date | null;
}

export async function verifyGoogle(
  sku: string,
  purchaseToken: string
): Promise<VerifyResult> {
  const client = getClient();
  const pkg = env.androidPackage;
  const isSub = sku.startsWith('pro_');
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
  const url = isSub
    ? `${base}/purchases/subscriptions/${sku}/tokens/${purchaseToken}`
    : `${base}/purchases/products/${sku}/tokens/${purchaseToken}`;

  const { data } = await client.request<Record<string, unknown>>({ url });

  if (isSub) {
    const expiryMillis = Number(data.expiryTimeMillis ?? 0);
    const expiresAt = expiryMillis ? new Date(expiryMillis) : null;
    return { valid: !!expiresAt && expiresAt.getTime() > Date.now(), expiresAt };
  }

  // One-time product: purchaseState 0 = purchased.
  const purchaseState = Number(data.purchaseState ?? 1);
  return { valid: purchaseState === 0, expiresAt: null };
}
