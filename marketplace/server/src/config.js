import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Client-facing site (the link you share with customers).
  port: Number(process.env.PORT || 8080),
  // Admin site — a SEPARATE port on its own tunnel, so the admin link is a
  // different URL that customers never see.
  adminPort: Number(process.env.ADMIN_PORT || 8787),
  siteName: process.env.SITE_NAME || 'Claude Marketplace',

  // The database file. On-disk + WAL (see db.js) is what makes logins and
  // messages survive a restart or the laptop going to sleep.
  dbPath: process.env.DB_PATH || 'data/marketplace.db',

  // First admin account, created automatically on first launch.
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-admin-password',
  adminName: process.env.ADMIN_NAME || 'Admin',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
};

// Loud warnings for insecure defaults, so nobody ships them by accident.
if (config.jwtSecret === 'dev-only-insecure-secret') {
  console.warn('[config] JWT_SECRET is the insecure default. Set a long random JWT_SECRET before going public.');
}
if (config.adminPassword === 'change-this-admin-password') {
  console.warn('[config] ADMIN_PASSWORD is the default. Change it before going public.');
}
