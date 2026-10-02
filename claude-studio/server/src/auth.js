import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { Users } from './db.js';

const TOKEN_TTL = '30d';

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, config.jwtSecret, { expiresIn: TOKEN_TTL });
}

// Express middleware: requires a valid "Authorization: Bearer <token>" header
// and attaches the fresh user record as req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = Users.byId(payload.uid);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(email, password) {
  if (!email || !EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}
