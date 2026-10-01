import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, type UserRow } from '../db';
import { signToken } from '../auth/jwt';

export const authRouter = Router();

const credsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.]+$/, 'letters, numbers, _ and . only'),
  password: z.string().min(8).max(128),
  publicKey: z.string().min(10).max(200),
});

function publicUser(row: UserRow) {
  return { id: row.id, username: row.username, publicKey: row.public_key };
}

authRouter.post('/register', async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid' });
    return;
  }
  const { username, password, publicKey } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (username, password_hash, public_key)
       VALUES ($1, $2, $3) RETURNING *`,
      [username.toLowerCase(), passwordHash, publicKey]
    );
    const user = rows[0];
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err: unknown) {
    // Unique violation -> username taken.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'username already taken' });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const schema = credsSchema.pick({ username: true, password: true }).extend({
    // On a fresh device the key may differ; accept and update it.
    publicKey: z.string().min(10).max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid credentials' });
    return;
  }
  const { username, password, publicKey } = parsed.data;

  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE username = $1`,
    [username.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }

  if (publicKey && publicKey !== user.public_key) {
    await pool.query(`UPDATE users SET public_key = $1 WHERE id = $2`, [
      publicKey,
      user.id,
    ]);
    user.public_key = publicKey;
  }

  res.json({ token: signToken(user.id), user: publicUser(user) });
});
