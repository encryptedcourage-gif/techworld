import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

// --- Persistent, on-disk database ---------------------------------------
// Everything (member accounts, plans, conversations, every chat message) is
// stored in this file. Because it is a real file on disk — not kept in memory
// — it survives the server restarting and the laptop going to sleep. WAL mode
// keeps writes durable and lets reads and writes happen at the same time.
//
// Uses Node's BUILT-IN SQLite (node:sqlite), so there is no native module to
// compile — it works on whatever modern Node you have installed. The API is
// the same shape as better-sqlite3: prepare().run()/.get()/.all().
mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;'); // durable + fast; survives process crash

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',   -- 'admin' | 'member'
    name          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    price_cents   INTEGER NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'USD',
    period        TEXT NOT NULL DEFAULT 'month',     -- 'month' | 'once'
    active        INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One persistent conversation per member. It is created the first time the
  -- member clicks "Buy" (or the admin opens it) and never goes away, so the
  -- member finds the same thread every time they sign back in.
  CREATE TABLE IF NOT EXISTS conversations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id    INTEGER NOT NULL UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    admin_unread INTEGER NOT NULL DEFAULT 0,  -- new member messages the admin hasn't read
    member_unread INTEGER NOT NULL DEFAULT 0, -- new admin messages the member hasn't read
    FOREIGN KEY (member_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_role     TEXT NOT NULL,              -- 'admin' | 'member' | 'system'
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
`);

export const Users = {
  create({ email, passwordHash, role = 'member', name = '' }) {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)')
      .run(email.trim().toLowerCase(), passwordHash, role, name);
    return Users.byId(info.lastInsertRowid);
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  byEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  },
  setPassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  },
  members() {
    return db.prepare("SELECT * FROM users WHERE role = 'member' ORDER BY created_at DESC").all();
  },
  remove(id) {
    const conv = Conversations.byMember(id);
    if (conv) {
      db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conv.id);
      db.prepare('DELETE FROM conversations WHERE id = ?').run(conv.id);
    }
    db.prepare("DELETE FROM users WHERE id = ? AND role = 'member'").run(id);
  },
};

export const Plans = {
  all() {
    return db.prepare('SELECT * FROM plans ORDER BY sort_order ASC, id ASC').all();
  },
  active() {
    return db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort_order ASC, id ASC').all();
  },
  byId(id) {
    return db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  },
  create({ name, description = '', priceCents = 0, currency = 'USD', period = 'month', sortOrder = 0 }) {
    const info = db
      .prepare(
        'INSERT INTO plans (name, description, price_cents, currency, period, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(name, description, priceCents, currency, period, sortOrder);
    return Plans.byId(info.lastInsertRowid);
  },
  update(id, { name, description, priceCents, currency, period, active, sortOrder }) {
    const p = Plans.byId(id);
    if (!p) return null;
    db.prepare(
      `UPDATE plans SET name = ?, description = ?, price_cents = ?, currency = ?, period = ?, active = ?, sort_order = ?
       WHERE id = ?`
    ).run(
      name ?? p.name,
      description ?? p.description,
      priceCents ?? p.price_cents,
      currency ?? p.currency,
      period ?? p.period,
      active == null ? p.active : active ? 1 : 0,
      sortOrder ?? p.sort_order,
      id
    );
    return Plans.byId(id);
  },
  remove(id) {
    db.prepare('DELETE FROM plans WHERE id = ?').run(id);
  },
};

export const Conversations = {
  byMember(memberId) {
    return db.prepare('SELECT * FROM conversations WHERE member_id = ?').get(memberId);
  },
  byId(id) {
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  },
  ensureForMember(memberId) {
    let conv = Conversations.byMember(memberId);
    if (!conv) {
      const info = db.prepare('INSERT INTO conversations (member_id) VALUES (?)').run(memberId);
      conv = Conversations.byId(info.lastInsertRowid);
    }
    return conv;
  },
  // All conversations with the member's details and last message, for the admin inbox.
  listForAdmin() {
    return db
      .prepare(
        `SELECT c.*, u.email AS member_email, u.name AS member_name,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
                (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
         FROM conversations c
         JOIN users u ON u.id = c.member_id
         ORDER BY COALESCE(c.updated_at, c.created_at) DESC`
      )
      .all();
  },
  touch(id) {
    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(id);
  },
  markReadByAdmin(id) {
    db.prepare('UPDATE conversations SET admin_unread = 0 WHERE id = ?').run(id);
  },
  markReadByMember(id) {
    db.prepare('UPDATE conversations SET member_unread = 0 WHERE id = ?').run(id);
  },
  bumpUnread(id, forRole) {
    // A message from `forRole` is unread by the *other* side.
    if (forRole === 'member') {
      db.prepare('UPDATE conversations SET admin_unread = admin_unread + 1 WHERE id = ?').run(id);
    } else if (forRole === 'admin') {
      db.prepare('UPDATE conversations SET member_unread = member_unread + 1 WHERE id = ?').run(id);
    }
  },
  totalAdminUnread() {
    return db.prepare('SELECT COALESCE(SUM(admin_unread), 0) AS n FROM conversations').get().n;
  },
};

export const Messages = {
  add({ conversationId, senderRole, body }) {
    const info = db
      .prepare('INSERT INTO messages (conversation_id, sender_role, body) VALUES (?, ?, ?)')
      .run(conversationId, senderRole, body);
    Conversations.touch(conversationId);
    if (senderRole !== 'system') Conversations.bumpUnread(conversationId, senderRole);
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  },
  list(conversationId, sinceId = 0) {
    return db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC')
      .all(conversationId, sinceId);
  },
};
