import { Router } from 'express';
import { pool, type UserRow } from '../db';
import { requireAuth } from '../auth/middleware';

export const usersRouter = Router();

/** Look up a user by username to start a chat (returns their public key). */
usersRouter.get('/:username', requireAuth, async (req, res) => {
  const username = String(req.params.username).toLowerCase();
  const { rows } = await pool.query<UserRow>(
    `SELECT id, username, public_key FROM users WHERE username = $1`,
    [username]
  );
  const user = rows[0];
  if (!user) {
    res.status(404).json({ error: 'user not found' });
    return;
  }
  res.json({ id: user.id, username: user.username, publicKey: user.public_key });
});

/** Update the caller's published public key (e.g. after reinstall). */
usersRouter.put('/me/key', requireAuth, async (req, res) => {
  const publicKey = String(req.body?.publicKey ?? '');
  if (publicKey.length < 10) {
    res.status(400).json({ error: 'invalid publicKey' });
    return;
  }
  await pool.query(`UPDATE users SET public_key = $1 WHERE id = $2`, [
    publicKey,
    req.userId,
  ]);
  res.json({ ok: true });
});

/** Register the caller's Expo push token. */
usersRouter.put('/me/push-token', requireAuth, async (req, res) => {
  const pushToken = String(req.body?.pushToken ?? '');
  await pool.query(`UPDATE users SET push_token = $1 WHERE id = $2`, [
    pushToken || null,
    req.userId,
  ]);
  res.json({ ok: true });
});
