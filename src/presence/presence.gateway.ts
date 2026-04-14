import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { ExtendedSocket } from 'src/types/chess';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { FriendsService } from 'src/friends/friends.service';

@WebSocketGateway({
  namespace: '/presence',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class PresenceGateway {
  @WebSocketServer() server!: Server;

  private disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
    private readonly friends: FriendsService,
  ) {}

  async handleConnection(socket: ExtendedSocket) {
    const auth = socket.handshake?.auth as { wsToken?: unknown } | undefined;
    const token = typeof auth?.wsToken === 'string' ? auth.wsToken : undefined;

    try {
      if (!token) {
        socket.emit('ws_unauthorized', { reason: 'missing_ws_token' });
        return socket.disconnect();
      }

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_WS_SECRET!,
      });

      const userId = payload.sub;
      socket.data.userId = userId;

      // Cancel any pending disconnect timer for this user
      await socket.join(`user:${userId}`);

      // Cancel timer first
      const existingTimer = this.disconnectTimers.get(userId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.disconnectTimers.delete(userId);
      }

      // Set online FIRST
      await this.presence.setStatus(userId, 'online');

      // THEN notify friends — this must happen before any snapshot is sent
      await this.emitToFriends(userId, 'presence_update', {
        userId,
        status: 'online',
      });

      await this.sendSnapshot(socket, userId);

      console.log(`[presence] connected: ${userId}`);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;

    console.log(`[presence] disconnected: ${userId}`);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(userId);

      const roomSockets = await this.server.in(`user:${userId}`).fetchSockets();

      if (roomSockets.length === 0) {
        const current = await this.presence.getStatus(userId);

        if (current.status !== 'playing') {
          await this.presence.setStatus(userId, 'offline');
          await this.emitToFriends(userId, 'presence_update', {
            userId,
            status: 'offline',
          });
          console.log(`[presence] set offline: ${userId}`);
        }
      }
    }, 5000);

    this.disconnectTimers.set(userId, timer);
  }

  @SubscribeMessage('get_friends_with_presence')
  async handleGetFriends(socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;

    const friends = await this.friends.listFriends(userId);

    const result = await Promise.all(
      friends.map(async (f) => {
        const roomSockets = await this.server.in(`user:${f.id}`).fetchSockets();

        const isConnected = roomSockets.length > 0;
        const s = await this.presence.getStatus(f.id);

        return {
          id: f.id,
          name: f.name,
          avatar: f.avatar,
          rating: f.rating,
          status: isConnected
            ? s.status === 'playing'
              ? 'playing'
              : 'online'
            : ('offline' as const),
          lastSeen: s.lastSeen ? Number(s.lastSeen) : null,
        };
      }),
    );

    console.log(`[get_friends_with_presence] for ${userId}:`, result);
    socket.emit('friends_with_presence', result);
  }

  @SubscribeMessage('request_presence_snapshot')
  async handleSnapshotRequest(socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;
    await this.sendSnapshot(socket, userId);
  }

  private async sendSnapshot(socket: ExtendedSocket, userId: string) {
    const friends = await this.friends.listFriends(userId);

    const snapshot = await Promise.all(
      friends.map(async (f) => {
        const roomSockets = await this.server.in(`user:${f.id}`).fetchSockets();

        const isConnected = roomSockets.length > 0;

        if (isConnected) {
          const s = await this.presence.getStatus(f.id);
          return {
            userId: f.id,
            status: s.status === 'playing' ? 'playing' : 'online',
          };
        } else {
          return { userId: f.id, status: 'offline' as const };
        }
      }),
    );

    console.log(`[snapshot] for ${userId}:`, snapshot);
    socket.emit('presence_snapshot', snapshot);
  }

  async emitToFriends(
    userId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const friends = await this.friends.listFriends(userId);
    this.server.to(friends.map((f) => `user:${f.id}`)).emit(event, payload);
  }
}
