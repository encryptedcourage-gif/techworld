import type { Server } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyToken } from '../auth/jwt';
import { addConnection, removeConnection } from './hub';

/**
 * Attach a WebSocket server at /ws. The client connects with its auth token as
 * a query param: wss://host/ws?token=JWT. The server pushes new messages as
 * { type: 'message', message: {...} } frames.
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, userId: string) => {
    addConnection(userId, ws);

    ws.on('close', () => removeConnection(userId, ws));
    ws.on('error', () => removeConnection(userId, ws));
    // Lightweight keepalive so idle mobile connections aren't dropped.
    ws.on('message', (raw) => {
      if (raw.toString() === 'ping') ws.send('pong');
    });
    ws.send(JSON.stringify({ type: 'ready' }));
  });

  // Authenticate during the HTTP upgrade so unauthenticated sockets never open.
  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) return;
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token') ?? '';
    const userId = verifyToken(token);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, userId);
    });
  });
}
