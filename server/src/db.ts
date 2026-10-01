import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { env } from './env';

export const pool = new Pool({ connectionString: env.databaseUrl });

/** Apply the schema (idempotent) on startup. */
export async function migrate(): Promise<void> {
  const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  public_key: string;
  push_token: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_public_key: string;
  ciphertext: string;
  nonce: string;
  delivered: boolean;
  created_at: string;
}

export interface EntitlementRow {
  id: string;
  user_id: string;
  sku: string;
  platform: string;
  purchase_token: string;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}
