import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { findProduct, type Feature } from './products';

/**
 * Entitlements store — the app's memory of what the user has paid for.
 *
 * Purchases (from IAP) and reward grants (from rewarded ads) both flow into
 * here. The rest of the UI asks `hasFeature(...)` to decide whether to gate
 * something or show an ad.
 *
 * NOTE ON SECURITY: this local cache is for fast UI decisions only. For
 * anything that costs you money to serve (e.g. 2 GB uploads), verify the
 * purchase server-side with Google Play Developer API / App Store Server API
 * before honoring it. See docs/MONETIZATION.md → "Verify on your server".
 */

const STORAGE_KEY = 'entitlements.v1';

interface PersistedState {
  ownedSkus: string[];
  /** Feature -> epoch millis the temporary (ad-reward) grant expires. */
  temporaryGrants: Record<string, number>;
}

interface EntitlementsState extends PersistedState {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Record a confirmed purchase and persist it. */
  grantPurchase: (sku: string) => Promise<void>;
  /** Replace the full owned set (e.g. after restorePurchases). */
  setOwned: (skus: string[]) => Promise<void>;
  /** Grant a feature for a limited time (rewarded-ad unlocks). */
  grantTemporary: (feature: Feature, durationMs: number) => Promise<void>;
  hasFeature: (feature: Feature) => boolean;
  isPro: () => boolean;
}

function featuresFromSkus(skus: string[]): Set<Feature> {
  const features = new Set<Feature>();
  for (const sku of skus) {
    const product = findProduct(sku);
    product?.grants.forEach((f) => features.add(f));
  }
  return features;
}

async function persist(state: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal: entitlements will be re-derived from the store on next launch.
  }
}

export const useEntitlements = create<EntitlementsState>((set, get) => ({
  ownedSkus: [],
  temporaryGrants: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        set({
          ownedSkus: parsed.ownedSkus ?? [],
          temporaryGrants: parsed.temporaryGrants ?? {},
        });
      }
    } catch {
      // Ignore corrupt cache; start clean.
    } finally {
      set({ hydrated: true });
    }
  },

  grantPurchase: async (sku) => {
    const ownedSkus = Array.from(new Set([...get().ownedSkus, sku]));
    set({ ownedSkus });
    await persist({ ownedSkus, temporaryGrants: get().temporaryGrants });
  },

  setOwned: async (skus) => {
    const ownedSkus = Array.from(new Set(skus));
    set({ ownedSkus });
    await persist({ ownedSkus, temporaryGrants: get().temporaryGrants });
  },

  grantTemporary: async (feature, durationMs) => {
    const temporaryGrants = {
      ...get().temporaryGrants,
      [feature]: Date.now() + durationMs,
    };
    set({ temporaryGrants });
    await persist({ ownedSkus: get().ownedSkus, temporaryGrants });
  },

  hasFeature: (feature) => {
    const { ownedSkus, temporaryGrants } = get();
    if (featuresFromSkus(ownedSkus).has(feature)) return true;
    const expiry = temporaryGrants[feature];
    return typeof expiry === 'number' && expiry > Date.now();
  },

  isPro: () => {
    // "Pro" = owns an active subscription (grants the full feature set).
    return get().ownedSkus.some((sku) => sku.startsWith('pro_'));
  },
}));

/** Convenience selector usable outside React. */
export function shouldShowAds(): boolean {
  return !useEntitlements.getState().hasFeature('no_ads');
}
