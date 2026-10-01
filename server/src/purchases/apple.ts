import { env } from '../env';
import type { VerifyResult } from './google';

/**
 * Verify an Apple receipt. Uses the /verifyReceipt endpoint: POST the base64
 * receipt to production, and if Apple returns 21007 (sandbox receipt) retry
 * against sandbox. Simple and reliable for v1.
 *
 * For a larger app, migrate to the App Store Server API (StoreKit 2) for
 * renewal/refund notifications.
 */

const PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleResponse {
  status: number;
  latest_receipt_info?: Array<{
    product_id: string;
    expires_date_ms?: string;
  }>;
  receipt?: {
    in_app?: Array<{ product_id: string; expires_date_ms?: string }>;
  };
}

async function callApple(url: string, receipt: string): Promise<AppleResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receipt,
      password: env.appleSharedSecret,
      'exclude-old-transactions': true,
    }),
  });
  return (await res.json()) as AppleResponse;
}

export async function verifyApple(
  sku: string,
  receipt: string
): Promise<VerifyResult> {
  let body = await callApple(PROD, receipt);
  if (body.status === 21007) {
    body = await callApple(SANDBOX, receipt);
  }
  if (body.status !== 0) {
    return { valid: false, expiresAt: null };
  }

  const entries = [
    ...(body.latest_receipt_info ?? []),
    ...(body.receipt?.in_app ?? []),
  ].filter((e) => e.product_id === sku);

  if (entries.length === 0) return { valid: false, expiresAt: null };

  // Use the latest expiry if this is a subscription.
  const expiryMs = entries
    .map((e) => Number(e.expires_date_ms ?? 0))
    .reduce((a, b) => Math.max(a, b), 0);

  if (expiryMs > 0) {
    const expiresAt = new Date(expiryMs);
    return { valid: expiresAt.getTime() > Date.now(), expiresAt };
  }

  // Non-expiring (one-time) product present in the receipt.
  return { valid: true, expiresAt: null };
}
