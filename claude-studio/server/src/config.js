import dotenv from 'dotenv';

dotenv.config();

const VALID_PROVIDERS = ['gemini', 'groq', 'anthropic'];

function provider(envVar, fallback) {
  const v = (process.env[envVar] || fallback).toLowerCase();
  return VALID_PROVIDERS.includes(v) ? v : fallback;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:8080',

  // Provider for FREE users (default). Paid subscribers can use a different one.
  freeProvider: provider('AI_PROVIDER', 'gemini'),
  // Provider for PAYING subscribers. Falls back to the free provider if unset.
  paidProvider: provider('PAID_AI_PROVIDER', provider('AI_PROVIDER', 'gemini')),

  // --- Google Gemini (free API key at https://aistudio.google.com) ---
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  // --- Groq (free API key at https://console.groq.com, fast open models) ---
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  // --- Anthropic Claude (paid API key at https://console.anthropic.com) ---
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // One Stripe Price id per paid tier (create them in the Stripe dashboard).
  stripePriceBasic: process.env.STRIPE_PRICE_BASIC || '',
  stripePricePro: process.env.STRIPE_PRICE_PRO || '',

  // Free users get full access for this many days, then must upgrade.
  freeTrialDays: Number(process.env.FREE_TRIAL_DAYS || 1),
  freeMonthlyLimit: Number(process.env.FREE_MONTHLY_LIMIT || 25),
  basicMonthlyLimit: Number(process.env.BASIC_MONTHLY_LIMIT || 300),
  proMonthlyLimit: Number(process.env.PRO_MONTHLY_LIMIT || 2000),
};

// The subscription tiers, the single source of truth for pricing + what each
// plan gets. `priceText` is only for display — the real charge is the Stripe
// Price you create and reference by id.
export const PLANS = {
  free: {
    key: 'free',
    label: 'Free',
    priceText: 'Free',
    blurb: 'Try it out',
    provider: config.freeProvider,
    limit: config.freeMonthlyLimit,
    priceId: null,
  },
  basic: {
    key: 'basic',
    label: 'Basic',
    priceText: '$10/mo',
    blurb: 'Gemini AI',
    provider: 'gemini',
    limit: config.basicMonthlyLimit,
    priceId: config.stripePriceBasic,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    priceText: '$20/mo',
    blurb: 'Groq / Claude AI',
    provider: config.paidProvider,
    limit: config.proMonthlyLimit,
    priceId: config.stripePricePro,
  },
};

export const planOf = (user) => PLANS[user?.plan] || PLANS.free;

// Free-trial window, computed from the account's creation time.
export function trialStatus(user) {
  const created = new Date(String(user?.created_at || '').replace(' ', 'T') + 'Z');
  const ms = created.getTime();
  if (Number.isNaN(ms)) return { active: true, endsAt: null }; // fail open, never lock out
  const endsAt = new Date(ms + config.freeTrialDays * 86400000);
  return { active: Date.now() < endsAt.getTime(), endsAt: endsAt.toISOString() };
}

// Paid tiers that are actually purchasable (have a Stripe Price configured).
export const purchasablePlans = () =>
  ['basic', 'pro'].map((k) => PLANS[k]).filter((p) => p.priceId);

export const stripeEnabled = Boolean(
  config.stripeSecretKey && config.stripeWebhookSecret && purchasablePlans().length > 0
);

const MODEL_BY_PROVIDER = {
  gemini: config.geminiModel,
  groq: config.groqModel,
  anthropic: config.claudeModel,
};
const KEY_BY_PROVIDER = {
  gemini: { key: config.geminiApiKey, where: 'GEMINI_API_KEY (free from aistudio.google.com)' },
  groq: { key: config.groqApiKey, where: 'GROQ_API_KEY (free from console.groq.com)' },
  anthropic: { key: config.anthropicApiKey, where: 'ANTHROPIC_API_KEY (from console.anthropic.com)' },
};

export const modelFor = (p) => MODEL_BY_PROVIDER[p] || '(unknown)';

// Warn loudly for any provider that's actually in use but has no key yet.
for (const p of new Set([config.freeProvider, config.paidProvider])) {
  const { key, where } = KEY_BY_PROVIDER[p] || {};
  if (!key) console.warn(`[config] No API key for provider "${p}". Set ${where}.`);
}
