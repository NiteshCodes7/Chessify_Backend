import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Server } from 'socket.io';
import type { ExtendedSocket } from 'src/types/chess';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private chatService: ChatService,
    private readonly jwt: JwtService,
  ) {}

  async handleConnection(socket: ExtendedSocket) {
    try {
      const auth = socket.handshake?.auth as { wsToken?: unknown } | undefined;
      const token =
        typeof auth?.wsToken === 'string' ? auth.wsToken : undefined;

      if (!token) {
        return socket.disconnect();
      }

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_WS_SECRET!,
      });

      const userId = payload.sub;

      socket.data.userId = userId;

      await socket.join(`user:${userId}`);

      console.log('CONNECTED:', userId);
    } catch (err) {
      console.log('WS auth failed', err);
      socket.disconnect();
    }
  }

  @SubscribeMessage('dm')
  async handleDM(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody() data: { to: string; content: string },
  ) {
    const from = socket.data.userId;
    if (!from || !data.to || !data.content) return;

    const msg = await this.chatService.saveDM(from, data.to, data.content);

    const payload = {
      id: msg.id,
      from,
      to: data.to,
      content: msg.content,
      createdAt: msg.createdAt,
    };

    // ✅ emit to BOTH users
    this.server.to(`user:${from}`).emit('dm', payload);
    this.server.to(`user:${data.to}`).emit('dm', payload);
  }

  @SubscribeMessage('game_chat')
  async handleGameChat(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody() data: { gameId: string; content: string },
  ) {
    const from = socket.data.userId;
    if (!from) return 'User not existed';

    await this.chatService.saveGameMessage(data.gameId, from, data.content);
    this.server
      .to(data.gameId)
      .emit('game_chat', { from, content: data.content });
  }
}
