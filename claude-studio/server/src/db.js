import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || 'data/studio.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    email              TEXT UNIQUE NOT NULL,
    password_hash      TEXT NOT NULL,
    plan               TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'basic' | 'pro'
    subscription_status TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'active' | 'canceled'
    stripe_customer_id TEXT,
    usage_count        INTEGER NOT NULL DEFAULT 0,
    usage_month        TEXT NOT NULL DEFAULT '',        -- 'YYYY-MM'
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe migration for databases created before the "plan" column existed.
const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!cols.includes('plan')) {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
}

const currentMonth = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

export const Users = {
  create(email, passwordHash) {
    const info = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(email, passwordHash);
    return Users.byId(info.lastInsertRowid);
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },
  byEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },
  byStripeCustomer(customerId) {
    return db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(customerId);
  },
  setStripeCustomer(id, customerId) {
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, id);
  },
  setSubscription(id, status) {
    db.prepare('UPDATE users SET subscription_status = ? WHERE id = ?').run(status, id);
  },
  setPlan(id, plan) {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, id);
  },

  // Returns the up-to-date usage count for this month, resetting at month change.
  usageThisMonth(user) {
    const month = currentMonth();
    if (user.usage_month !== month) {
      db.prepare('UPDATE users SET usage_count = 0, usage_month = ? WHERE id = ?').run(month, user.id);
      return 0;
    }
    return user.usage_count;
  },
  incrementUsage(id) {
    const month = currentMonth();
    db.prepare(
      `UPDATE users SET usage_count = usage_count + 1, usage_month = ? WHERE id = ?`
    ).run(month, id);
  },
};

export const Files = {
  create(id, userId, name, content) {
    db.prepare('INSERT INTO files (id, user_id, name, content) VALUES (?, ?, ?, ?)').run(
      id,
      userId,
      name,
      content
    );
  },
  get(id) {
    return db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  },
};
