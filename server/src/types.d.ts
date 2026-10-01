import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware. The authenticated user's id. */
      userId?: string;
    }
  }
}

export {};
