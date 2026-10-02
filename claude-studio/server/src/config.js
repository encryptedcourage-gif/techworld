import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('change-me') || value.includes('xxxxxxxx')) {
    // Not fatal at import time — some values (Stripe) are optional until you
    // turn payments on. We warn loudly instead so misconfig is obvious.
    console.warn(`[config] ${name} is not set (or still a placeholder).`);
  }
  return value || '';
}

export const config = {
  port: Number(process.env.PORT || 8080),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:8080',

  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',

  jwtSecret: required('JWT_SECRET') || 'dev-only-insecure-secret',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripePriceId: process.env.STRIPE_PRICE_ID || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  freeMonthlyLimit: Number(process.env.FREE_MONTHLY_LIMIT || 5),
  proMonthlyLimit: Number(process.env.PRO_MONTHLY_LIMIT || 1000),
};

export const stripeEnabled = Boolean(
  config.stripeSecretKey && config.stripePriceId && config.stripeWebhookSecret
);
