import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config, stripeEnabled } from './config.js';
import { Users, Files } from './db.js';
import {
  hashPassword,
  verifyPassword,
  validateCredentials,
  signToken,
  requireAuth,
} from './auth.js';
import { runAssistant } from './claude.js';
import { createCheckoutSession, handleWebhook } from './stripe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());

// Per-user conversation history, in memory. Good enough for a single-instance
// MVP; swap for a database/Redis store when you run multiple instances.
const conversations = new Map();

// ---- Stripe webhook needs the RAW body, so mount it before express.json ----
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripeEnabled) return res.status(400).send('Stripe not configured.');
  try {
    const type = handleWebhook(req.body, req.headers['stripe-signature']);
    console.log(`[stripe] handled ${type}`);
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe] webhook error:', err.message);
    res.status(400).send(`Webhook error: ${err.message}`);
  }
});

app.use(express.json({ limit: '1mb' }));

function planLimit(user) {
  return user.subscription_status === 'active' ? config.proMonthlyLimit : config.freeMonthlyLimit;
}

function publicUser(user) {
  const used = Users.usageThisMonth(user);
  return {
    email: user.email,
    subscription: user.subscription_status,
    usedThisMonth: used,
    monthlyLimit: planLimit(user),
    stripeEnabled,
  };
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { email, password } = req.body || {};
  const problem = validateCredentials(email, password);
  if (problem) return res.status(400).json({ error: problem });
  if (Users.byEmail(email)) return res.status(409).json({ error: 'That email is already registered.' });

  const user = Users.create(email.toLowerCase(), hashPassword(password));
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? Users.byEmail(email.toLowerCase()) : null;
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Chat ----------
app.post('/api/chat', requireAuth, async (req, res) => {
  const message = (req.body?.message || '').toString().trim();
  if (!message) return res.status(400).json({ error: 'Message is empty.' });

  const used = Users.usageThisMonth(req.user);
  const limit = planLimit(req.user);
  if (used >= limit) {
    const needsSub = req.user.subscription_status !== 'active';
    return res.status(402).json({
      error: needsSub
        ? 'You have used all your free messages. Subscribe to keep going.'
        : "You've reached this month's message limit.",
      needsSubscription: needsSub,
    });
  }

  try {
    const history = conversations.get(req.user.id) || [];
    const { reply, files, newHistory } = await runAssistant(req.user.id, history, message);
    conversations.set(req.user.id, newHistory);
    Users.incrementUsage(req.user.id);

    const fresh = Users.byId(req.user.id);
    res.json({
      reply,
      files, // [{ id, name }]
      user: publicUser(fresh),
    });
  } catch (err) {
    console.error('[chat] error:', err);
    res.status(500).json({ error: 'The assistant had a problem. Please try again.' });
  }
});

app.post('/api/reset', requireAuth, (req, res) => {
  conversations.delete(req.user.id);
  res.json({ ok: true });
});

// ---------- File download ----------
app.get('/api/files/:id', requireAuth, (req, res) => {
  const file = Files.get(req.params.id);
  if (!file || file.user_id !== req.user.id) {
    return res.status(404).json({ error: 'File not found.' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(file.content);
});

// ---------- Subscription checkout ----------
app.post('/api/checkout', requireAuth, async (req, res) => {
  if (!stripeEnabled) {
    return res.status(400).json({ error: 'Payments are not set up yet.' });
  }
  try {
    const url = await createCheckoutSession(req.user);
    res.json({ url });
  } catch (err) {
    console.error('[checkout] error:', err.message);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

// ---------- Static site ----------
app.use(express.static(join(__dirname, '..', 'public')));

app.listen(config.port, () => {
  console.log(`Claude Studio running at ${config.publicUrl} (port ${config.port})`);
  console.log(`Model: ${config.claudeModel} | Stripe: ${stripeEnabled ? 'on' : 'OFF (free mode)'}`);
});
