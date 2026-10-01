import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  getProducts,
  getSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  requestSubscription,
  type Product,
  type Purchase,
  type PurchaseError,
  type Subscription,
  type SubscriptionAndroid,
} from 'react-native-iap';
import { Platform } from 'react-native';
import {
  INAPP_SKUS,
  SUBSCRIPTION_SKUS,
  findProduct,
} from './products';
import { useEntitlements } from './entitlements';

/**
 * In-app purchases (Play Billing + StoreKit via react-native-iap).
 *
 * Handles subscriptions, one-time purchases, and à-la-carte feature unlocks.
 * All purchase money is collected by the stores and paid out to your developer
 * payment profiles (minus the store's cut). See docs/MONETIZATION.md.
 */

type Listener = { remove: () => void };
let purchaseUpdateSub: Listener | null = null;
let purchaseErrorSub: Listener | null = null;
let connected = false;

export interface StoreCatalog {
  subscriptions: Subscription[];
  products: Product[];
}

/**
 * Open the billing connection and start listening for purchases. Call once at
 * startup. The purchase listener is the ONLY place we grant entitlements, so a
 * purchase that completes while the app was backgrounded is still honored.
 */
export async function initIAP(): Promise<void> {
  if (connected) return;
  try {
    await initConnection();
    connected = true;
  } catch (err) {
    console.warn('[iap] initConnection failed', err);
    return;
  }

  purchaseUpdateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    const sku = purchase.productId;
    const verified = await verifyPurchase(purchase);
    if (!verified) return;

    await useEntitlements.getState().grantPurchase(sku);

    // Acknowledge/consume with the store so it finalizes. Our products are
    // non-consumable (owned forever) and subscriptions, so never consume.
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch (err) {
      console.warn('[iap] finishTransaction failed', err);
    }
  });

  purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
    if (error.code === 'E_USER_CANCELLED') return;
    console.warn('[iap] purchase error', error);
  });
}

export async function teardownIAP(): Promise<void> {
  purchaseUpdateSub?.remove();
  purchaseErrorSub?.remove();
  purchaseUpdateSub = null;
  purchaseErrorSub = null;
  if (connected) {
    await endConnection();
    connected = false;
  }
}

/** Load store metadata (localized prices, titles) for display. */
export async function loadCatalog(): Promise<StoreCatalog> {
  if (!connected) return { subscriptions: [], products: [] };
  const [subscriptions, products] = await Promise.all([
    getSubscriptions({ skus: SUBSCRIPTION_SKUS }).catch(() => []),
    getProducts({ skus: INAPP_SKUS }).catch(() => []),
  ]);
  return { subscriptions, products };
}

/** Buy a one-time product or feature unlock. */
export async function buyProduct(sku: string): Promise<void> {
  const def = findProduct(sku);
  if (!def || def.type !== 'inapp') {
    throw new Error(`Unknown or non-inapp product: ${sku}`);
  }
  await requestPurchase(
    Platform.OS === 'ios'
      ? { sku }
      : { skus: [sku] }
  );
  // Entitlement is granted by purchaseUpdatedListener on success.
}

/** Subscribe. On Android an offer token is required by Play Billing v5+. */
export async function buySubscription(
  sku: string,
  subscription?: Subscription
): Promise<void> {
  if (!SUBSCRIPTION_SKUS.includes(sku)) {
    throw new Error(`Unknown subscription: ${sku}`);
  }
  if (Platform.OS === 'ios') {
    await requestSubscription({ sku });
    return;
  }

  // Android: pass the first available base-plan offer token.
  const offerToken =
    (subscription as SubscriptionAndroid | undefined)
      ?.subscriptionOfferDetails?.[0]?.offerToken ?? '';
  await requestSubscription({
    sku,
    ...(offerToken
      ? { subscriptionOffers: [{ sku, offerToken }] }
      : {}),
  });
}

/**
 * Restore previous purchases (required by both stores). Re-derives the owned
 * set from what the store reports the account currently owns.
 */
export async function restorePurchases(): Promise<string[]> {
  if (!connected) return [];
  const purchases = await getAvailablePurchases().catch(() => []);
  const owned: string[] = [];
  for (const purchase of purchases) {
    if (await verifyPurchase(purchase)) {
      owned.push(purchase.productId);
    }
  }
  await useEntitlements.getState().setOwned(owned);
  return owned;
}

/**
 * Verify a purchase. For development we accept any purchase with a receipt.
 *
 * FOR PRODUCTION: send `purchase.transactionReceipt` (iOS) or
 * `purchase.purchaseToken` (Android) to YOUR backend and validate it against
 * the App Store Server API / Google Play Developer API before granting. That
 * is the only way to stop tampered clients from unlocking paid features for
 * free. See docs/MONETIZATION.md → "Verify on your server".
 */
async function verifyPurchase(purchase: Purchase): Promise<boolean> {
  return Boolean(purchase.transactionReceipt || purchase.purchaseToken);
}
