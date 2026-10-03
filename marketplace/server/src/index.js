import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { Users, Plans, Conversations, Messages, Settings } from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireAdmin,
  validateCredentials,
  publicUser,
} from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public'); // client site
const ADMIN_DIR = join(__dirname, '..', 'admin');   // admin site

// --- Seed the first admin account on first launch -----------------------
(function seedAdmin() {
  const existing = Users.byEmail(config.adminEmail);
  if (!existing) {
    Users.create({
      email: config.adminEmail,
      passwordHash: hashPassword(config.adminPassword),
      role: 'admin',
      name: config.adminName,
    });
    console.log(`[seed] Created admin account: ${config.adminEmail}`);
  } else if (existing.role !== 'admin') {
    console.warn(`[seed] ${config.adminEmail} exists but is not an admin.`);
  }
})();

const money = (p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  priceCents: p.price_cents,
  currency: p.currency,
  period: p.period,
  active: !!p.active,
  sortOrder: p.sort_order,
});
const msgOut = (m) => ({ id: m.id, role: m.sender_role, body: m.body, createdAt: m.created_at });

// A login handler locked to a single role, so member credentials never work on
// the admin site and vice versa.
function loginHandler(roleRequired) {
  return (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = Users.byEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    if (user.role !== roleRequired) {
      const hint = roleRequired === 'admin'
        ? 'This is the admin sign-in.'
        : 'This is the customer sign-in. Admins use the admin link.';
      return res.status(403).json({ error: hint });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  };
}

function common(app, { siteKind }) {
  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // room for an uploaded logo (sent as a data URL)
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) =>
    res.json({
      siteName: config.siteName,
      businessName: Settings.get('business_name', config.siteName),
      logo: Settings.get('logo', ''),
      site: siteKind,
    })
  );
  app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
}

// Post the admin's auto-welcome message into a conversation the first time
// (once per member). Call this when the member opens their chat or buys.
function maybeSendWelcome(conv) {
  const welcome = Settings.get('welcome_message', '').trim();
  if (welcome && !conv.welcomed) {
    Messages.add({ conversationId: conv.id, senderRole: 'admin', body: welcome });
    Conversations.markWelcomed(conv.id);
  }
}

// ======================= CLIENT app (customers) =======================
const clientApp = express();
common(clientApp, { siteKind: 'client' });

clientApp.get('/api/plans', (_req, res) => res.json({ plans: Plans.active().map(money) }));
clientApp.post('/api/login', loginHandler('member'));

clientApp.post('/api/buy', requireAuth, (req, res) => {
  if (req.user.role !== 'member') return res.status(400).json({ error: 'Admins do not buy plans.' });
  const plan = Plans.byId(Number(req.body?.planId));
  if (!plan || !plan.active) return res.status(404).json({ error: 'Plan not found.' });
  const conv = Conversations.ensureForMember(req.user.id);
  const price = `${(plan.price_cents / 100).toFixed(2)} ${plan.currency}`;
  const per = plan.period === 'month' ? '/month' : ' one-time';
  Messages.add({
    conversationId: conv.id,
    senderRole: 'member',
    body: `Hi! I'd like to buy the "${plan.name}" plan (${price}${per}). Please help me get set up with my Claude.ai subscription.`,
  });
  maybeSendWelcome(conv); // auto-reply with the next-steps you wrote
  res.json({ ok: true, conversationId: conv.id });
});

clientApp.get('/api/conversation', requireAuth, (req, res) => {
  if (req.user.role !== 'member') return res.status(400).json({ error: 'Admins use the admin inbox.' });
  const conv = Conversations.ensureForMember(req.user.id);
  const since = Number(req.query.since || 0);
  if (!since) Conversations.markReadByMember(conv.id);
  res.json({
    conversationId: conv.id,
    messages: Messages.list(conv.id, since).map(msgOut),
    unread: Conversations.byId(conv.id).member_unread,
  });
});

clientApp.post('/api/conversation/messages', requireAuth, (req, res) => {
  if (req.user.role !== 'member') return res.status(400).json({ error: 'Admins reply from the inbox.' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message is too long.' });
  const conv = Conversations.ensureForMember(req.user.id);
  const m = Messages.add({ conversationId: conv.id, senderRole: 'member', body });
  maybeSendWelcome(conv); // first time they write, auto-reply with the next-steps you wrote
  res.json({ message: msgOut(m) });
});

clientApp.use(express.static(PUBLIC_DIR)); // serves client index.html + app.js + styles.css

// ======================= ADMIN app (you) =======================
const adminApp = express();
common(adminApp, { siteKind: 'admin' });

adminApp.post('/api/login', loginHandler('admin'));

adminApp.get('/api/admin/members', requireAdmin, (_req, res) => res.json({ members: Users.members().map(publicUser) }));

adminApp.post('/api/admin/members', requireAdmin, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const err = validateCredentials(email, password);
  if (err) return res.status(400).json({ error: err });
  if (Users.byEmail(email)) return res.status(409).json({ error: 'That email already has an account.' });
  const member = Users.create({ email, passwordHash: hashPassword(password), role: 'member', name });
  Conversations.ensureForMember(member.id);
  res.json({ member: publicUser(member) });
});

adminApp.post('/api/admin/members/:id/password', requireAdmin, (req, res) => {
  const member = Users.byId(Number(req.params.id));
  if (!member || member.role !== 'member') return res.status(404).json({ error: 'Member not found.' });
  const password = String(req.body?.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  Users.setPassword(member.id, hashPassword(password));
  res.json({ ok: true });
});

adminApp.delete('/api/admin/members/:id', requireAdmin, (req, res) => {
  const member = Users.byId(Number(req.params.id));
  if (!member || member.role !== 'member') return res.status(404).json({ error: 'Member not found.' });
  Users.remove(member.id);
  res.json({ ok: true });
});

adminApp.get('/api/admin/plans', requireAdmin, (_req, res) => res.json({ plans: Plans.all().map(money) }));

adminApp.post('/api/admin/plans', requireAdmin, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Plan needs a name.' });
  const plan = Plans.create({
    name,
    description: String(req.body?.description || '').trim(),
    priceCents: Math.max(0, Math.round(Number(req.body?.priceCents) || 0)),
    currency: String(req.body?.currency || 'USD').trim().toUpperCase().slice(0, 3),
    period: req.body?.period === 'once' ? 'once' : 'month',
    sortOrder: Math.round(Number(req.body?.sortOrder) || 0),
  });
  res.json({ plan: money(plan) });
});

adminApp.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
  const plan = Plans.update(Number(req.params.id), {
    name: req.body?.name != null ? String(req.body.name).trim() : undefined,
    description: req.body?.description != null ? String(req.body.description).trim() : undefined,
    priceCents: req.body?.priceCents != null ? Math.max(0, Math.round(Number(req.body.priceCents))) : undefined,
    currency: req.body?.currency != null ? String(req.body.currency).toUpperCase().slice(0, 3) : undefined,
    period: req.body?.period != null ? (req.body.period === 'once' ? 'once' : 'month') : undefined,
    active: req.body?.active != null ? !!req.body.active : undefined,
    sortOrder: req.body?.sortOrder != null ? Math.round(Number(req.body.sortOrder)) : undefined,
  });
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  res.json({ plan: money(plan) });
});

adminApp.delete('/api/admin/plans/:id', requireAdmin, (req, res) => {
  if (!Plans.byId(Number(req.params.id))) return res.status(404).json({ error: 'Plan not found.' });
  Plans.remove(Number(req.params.id));
  res.json({ ok: true });
});

adminApp.get('/api/admin/conversations', requireAdmin, (_req, res) => {
  res.json({
    conversations: Conversations.listForAdmin().map((c) => ({
      id: c.id,
      memberId: c.member_id,
      memberEmail: c.member_email,
      memberName: c.member_name,
      lastBody: c.last_body,
      lastAt: c.last_at,
      unread: c.admin_unread,
      updatedAt: c.updated_at,
    })),
    totalUnread: Conversations.totalAdminUnread(),
  });
});

adminApp.get('/api/admin/conversations/:id/messages', requireAdmin, (req, res) => {
  const conv = Conversations.byId(Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const since = Number(req.query.since || 0);
  if (!since) Conversations.markReadByAdmin(conv.id);
  res.json({ messages: Messages.list(conv.id, since).map(msgOut) });
});

adminApp.post('/api/admin/conversations/:id/messages', requireAdmin, (req, res) => {
  const conv = Conversations.byId(Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message is too long.' });
  Conversations.markReadByAdmin(conv.id);
  res.json({ message: msgOut(Messages.add({ conversationId: conv.id, senderRole: 'admin', body })) });
});

// Delete a single message.
adminApp.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  const msg = Messages.get(Number(req.params.id));
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  Messages.remove(msg.id);
  res.json({ ok: true });
});

// Clear every message in one conversation (keeps the member and the thread).
adminApp.delete('/api/admin/conversations/:id/messages', requireAdmin, (req, res) => {
  const conv = Conversations.byId(Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
  Messages.clearConversation(conv.id);
  res.json({ ok: true });
});

// Clear every message in every conversation.
adminApp.delete('/api/admin/chats', requireAdmin, (_req, res) => {
  Messages.clearAll();
  res.json({ ok: true });
});

// Branding + auto-welcome settings.
adminApp.get('/api/admin/settings', requireAdmin, (_req, res) => {
  res.json({
    businessName: Settings.get('business_name', ''),
    logo: Settings.get('logo', ''),
    welcomeMessage: Settings.get('welcome_message', ''),
  });
});

adminApp.post('/api/admin/settings', requireAdmin, (req, res) => {
  if (req.body?.businessName != null) {
    Settings.set('business_name', String(req.body.businessName).trim().slice(0, 80));
  }
  if (req.body?.welcomeMessage != null) {
    Settings.set('welcome_message', String(req.body.welcomeMessage).slice(0, 4000));
  }
  if (req.body?.logo != null) {
    const logo = String(req.body.logo);
    // Only accept an empty value (to clear) or a small inline image data URL.
    if (logo === '') {
      Settings.set('logo', '');
    } else if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(logo)) {
      if (logo.length > 2_000_000) return res.status(400).json({ error: 'Logo image is too large (keep it under ~1.5 MB).' });
      Settings.set('logo', logo);
    } else {
      return res.status(400).json({ error: 'Logo must be an image file.' });
    }
  }
  res.json({
    businessName: Settings.get('business_name', ''),
    logo: Settings.get('logo', ''),
    welcomeMessage: Settings.get('welcome_message', ''),
  });
});

// Admin site: serve its own files, plus the shared stylesheet.
adminApp.get('/styles.css', (_req, res) => res.sendFile(join(PUBLIC_DIR, 'styles.css')));
adminApp.use(express.static(ADMIN_DIR));

// ======================= Listen =======================
clientApp.listen(config.port, () => {
  console.log(`\n  ${config.siteName}`);
  console.log(`  CLIENT site  → http://localhost:${config.port}   (share with customers)`);
});
adminApp.listen(config.adminPort, () => {
  console.log(`  ADMIN site   → http://localhost:${config.adminPort}   (keep this one private)`);
  console.log(`  Admin login: ${config.adminEmail}`);
  console.log(`  Database:    ${config.dbPath} (logins + messages persist here)\n`);
  console.log(`  For public links, run:  npm run public\n`);
});
