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
  namespace: '/',
  cors: { origin: 'http://localhost:3000', credentials: true },
})
export class PresenceGateway {
  @WebSocketServer() server!: Server;

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

      await socket.join(`user:${userId}`);

      await this.presence.setStatus(userId, 'online');

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
    setTimeout(async () => {
      // Check if user has any remaining sockets in the presence namespace
      const roomSockets = await this.server.in(`user:${userId}`).fetchSockets();

      if (roomSockets.length === 0) {
        const current = await this.presence.getStatus(userId);

        if (current.status !== 'playing') {
          await this.presence.setStatus(userId, 'offline');
          await this.emitToFriends(userId, 'presence_update', {
            userId,
            status: 'offline',
          });
        }
      }
    }, 5000);
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
        const s = await this.presence.getStatus(f.id);
        return { userId: f.id, status: s.status };
      }),
    );

    socket.emit('presence_snapshot', snapshot);
  }

  async emitToFriends(userId: string, event: string, payload: any) {
    const friends = await this.friends.listFriends(userId);
    this.server.to(friends.map((f) => `user:${f.id}`)).emit(event, payload);
  }
}
