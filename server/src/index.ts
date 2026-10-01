import express from 'express';
import { createServer } from 'http';
import { env } from './env';
import { migrate } from './db';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { messagesRouter } from './routes/messages';
import { purchasesRouter } from './routes/purchases';
import { attachWebSocket } from './realtime/ws';

async function main(): Promise<void> {
  await migrate();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);
  app.use('/users', usersRouter);
  app.use('/messages', messagesRouter);
  app.use('/purchases', purchasesRouter);

  // Centralized error handler so a thrown error never crashes the process.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction
    ) => {
      console.error('[error]', err);
      res.status(500).json({ error: 'internal error' });
    }
  );

  const server = createServer(app);
  attachWebSocket(server);

  server.listen(env.port, () => {
    console.log(`Encrypted server listening on :${env.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
