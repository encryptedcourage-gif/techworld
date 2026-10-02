import Stripe from 'stripe';
import { config, stripeEnabled } from './config.js';
import { Users } from './db.js';

export const stripe = stripeEnabled ? new Stripe(config.stripeSecretKey) : null;

// Creates (or reuses) a Stripe customer for this user and returns a hosted
// Checkout URL for the monthly subscription.
export async function createCheckoutSession(user) {
  if (!stripe) throw new Error('Stripe is not configured.');

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
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    success_url: `${config.publicUrl}/?checkout=success`,
    cancel_url: `${config.publicUrl}/?checkout=cancel`,
  });

  return session.url;
}

// Verifies and processes a Stripe webhook event. `rawBody` must be the raw
// request bytes (not parsed JSON) so the signature can be checked.
export function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured.');

  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const obj = event.data.object;
      const customerId = obj.customer;
      const user = Users.byStripeCustomer(customerId);
      if (user) {
        const status = obj.status === 'active' || obj.status === 'trialing' || obj.status === 'complete'
          ? 'active'
          : obj.status === 'canceled' || obj.status === 'unpaid'
            ? 'canceled'
            : 'active';
        Users.setSubscription(user.id, status);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const user = Users.byStripeCustomer(event.data.object.customer);
      if (user) Users.setSubscription(user.id, 'canceled');
      break;
    }
    default:
      break;
  }

  return event.type;
}
