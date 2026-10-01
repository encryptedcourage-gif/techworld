import jwt from 'jsonwebtoken';
import { env } from '../env';

interface TokenPayload {
  uid: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ uid: userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: '90d',
  });
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    return decoded.uid ?? null;
  } catch {
    return null;
  }
}
