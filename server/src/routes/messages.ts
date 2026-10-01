import { Router } from 'express';
import { z } from 'zod';
import { pool, type MessageRow, type UserRow } from '../db';
import { requireAuth } from '../auth/middleware';
import { deliverToUser } from '../realtime/hub';
import { sendPush } from '../push/expo';

export const messagesRouter = Router();

const sendSchema = z.object({
  recipientId: z.string().min(1),
  ciphertext: z.string().min(1).max(100_000),
  nonce: z.string().min(1).max(100),
});

interface WireMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderPublicKey: string;
  ciphertext: string;
  nonce: string;
  sentAt: string;
}

function toWire(row: MessageRow, senderUsername: string): WireMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderUsername,
    senderPublicKey: row.sender_public_key,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    sentAt: row.created_at,
  };
}

/** Send a sealed message. The server stores and relays ciphertext only. */
messagesRouter.post('/', requireAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid message' });
    return;
  }
  const senderId = req.userId!;
  const { recipientId, ciphertext, nonce } = parsed.data;

  const sender = (
    await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [senderId])
  ).rows[0];
  const recipient = (
    await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [recipientId])
  ).rows[0];
  if (!recipient) {
    res.status(404).json({ error: 'recipient not found' });
    return;
  }

  const row = (
    await pool.query<MessageRow>(
      `INSERT INTO messages
         (sender_id, recipient_id, sender_public_key, ciphertext, nonce)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [senderId, recipientId, sender.public_key, ciphertext, nonce]
    )
  ).rows[0];

  const wire = toWire(row, sender.username);

  // Try live delivery; if the recipient is offline, send a push instead.
  const delivered = deliverToUser(recipientId, { type: 'message', message: wire });
  if (delivered) {
    await pool.query(`UPDATE messages SET delivered = true WHERE id = $1`, [
      row.id,
    ]);
  } else {
    await sendPush(recipient.push_token, sender.username, 'Sent you a message', {
      type: 'message',
    });
  }

  res.json({ id: row.id, sentAt: row.created_at });
});

/** Fetch undelivered messages and mark them delivered. */
messagesRouter.get('/pending', requireAuth, async (req, res) => {
  const recipientId = req.userId!;
  const { rows } = await pool.query<MessageRow & { username: string }>(
    `SELECT m.*, u.username
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.recipient_id = $1 AND m.delivered = false
      ORDER BY m.created_at ASC`,
    [recipientId]
  );

  if (rows.length > 0) {
    await pool.query(
      `UPDATE messages SET delivered = true
        WHERE recipient_id = $1 AND delivered = false`,
      [recipientId]
    );
  }

  res.json({ messages: rows.map((r) => toWire(r, r.username)) });
});
