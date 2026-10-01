import { env, purchaseVerificationEnabled } from '../env';
import { verifyGoogle, type VerifyResult } from './google';
import { verifyApple } from './apple';

export type Platform = 'android' | 'ios';

/**
 * Verify a purchase with the right store. When no store credentials are
 * configured, runs in DEV mode: trusts the client so the full flow is testable
 * end-to-end. A warning is logged so this can't slip into production unnoticed.
 */
export async function verifyPurchase(
  platform: Platform,
  sku: string,
  token: string
): Promise<VerifyResult> {
  if (!purchaseVerificationEnabled) {
    console.warn(
      '[purchases] DEV MODE: no store credentials set — trusting client. ' +
        'Set GOOGLE_SERVICE_ACCOUNT_JSON / APPLE_SHARED_SECRET for production.'
    );
    return { valid: true, expiresAt: null };
  }

  if (platform === 'android') {
    if (!env.googleServiceAccountJson) {
      return { valid: false, expiresAt: null };
    }
    return verifyGoogle(sku, token);
  }

  if (platform === 'ios') {
    if (!env.appleSharedSecret) {
      return { valid: false, expiresAt: null };
    }
    return verifyApple(sku, token);
  }

  return { valid: false, expiresAt: null };
}
