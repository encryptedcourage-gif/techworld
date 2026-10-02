import Stripe from 'stripe';
import { config, stripeEnabled, PLANS } from './config.js';
import { Users } from './db.js';

export const stripe = stripeEnabled ? new Stripe(config.stripeSecretKey) : null;

// Creates (or reuses) a Stripe customer and returns a hosted Checkout URL for
// the chosen plan ('basic' or 'pro'). The plan is stored on the subscription's
// metadata so the webhook knows which tier the customer bought.
export async function createCheckoutSession(user, planKey) {
  if (!stripe) throw new Error('Stripe is not configured.');
  const plan = PLANS[planKey];
  if (!plan || !plan.priceId) throw new Error('That plan is not available.');

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: String(user.id) },
    });
    customerId = customer.id;
    Users.setStripeCustomer(user.id, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    subscription_data: { metadata: { plan: planKey } },
    metadata: { plan: planKey },
    success_url: `${config.publicUrl}/?checkout=success`,
    cancel_url: `${config.publicUrl}/?checkout=cancel`,
  });

  return session.url;
}

const ACTIVE_STATUSES = ['active', 'trialing'];
const DEAD_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];

// Verifies and processes a Stripe webhook event. `rawBody` must be the raw
// request bytes so the signature can be checked.
export function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured.');

  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const user = Users.byStripeCustomer(s.customer);
      const plan = s.metadata?.plan;
      if (user && plan) {
        Users.setPlan(user.id, plan);
        Users.setSubscription(user.id, 'active');
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const user = Users.byStripeCustomer(sub.customer);
      if (user) {
        if (ACTIVE_STATUSES.includes(sub.status)) {
          if (sub.metadata?.plan) Users.setPlan(user.id, sub.metadata.plan);
          Users.setSubscription(user.id, 'active');
        } else if (DEAD_STATUSES.includes(sub.status)) {
          Users.setPlan(user.id, 'free');
          Users.setSubscription(user.id, 'canceled');
        }
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const user = Users.byStripeCustomer(event.data.object.customer);
      if (user) {
        Users.setPlan(user.id, 'free');
        Users.setSubscription(user.id, 'canceled');
      }
      break;
    }
    default:
      break;
  }

  return event.type;
}
