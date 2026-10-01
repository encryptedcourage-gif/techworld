import type { WebSocket } from 'ws';

/**
 * In-memory connection hub for live message delivery.
 *
 * Maps a user id to their open sockets (a user may have the app open on more
 * than one device/tab). For a multi-instance deployment, replace this with a
 * Redis pub/sub fan-out so every instance can reach every socket.
 */
const connections = new Map<string, Set<WebSocket>>();

export function addConnection(userId: string, ws: WebSocket): void {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
}

export function removeConnection(userId: string, ws: WebSocket): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

export function isOnline(userId: string): boolean {
  return (connections.get(userId)?.size ?? 0) > 0;
}

/** Push a JSON payload to every live socket of a user. Returns true if any. */
export function deliverToUser(userId: string, payload: unknown): boolean {
  const set = connections.get(userId);
  if (!set || set.size === 0) return false;
  const data = JSON.stringify(payload);
  let delivered = false;
  for (const ws of set) {
    try {
      ws.send(data);
      delivered = true;
    } catch {
      // Drop broken sockets silently; the close handler cleans them up.
    }
  }
  return delivered;
}
