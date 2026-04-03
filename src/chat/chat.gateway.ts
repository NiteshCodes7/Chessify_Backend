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
  namespace: '/chat',
  cors: { origin: 'http://localhost:3000', credentials: true },
})
export class ChatGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwt: JwtService,
  ) {}

  async handleConnection(socket: ExtendedSocket) {
    const auth = socket.handshake?.auth as { wsToken?: unknown } | undefined;
    const token = typeof auth?.wsToken === 'string' ? auth.wsToken : undefined;

    try {
      if (!token) return socket.disconnect();

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_WS_SECRET!,
      });

      socket.data.userId = payload.sub;
      await socket.join(`user:${payload.sub}`);

      console.log(`[chat] connected: ${payload.sub}`);
    } catch {
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

    this.server.to(`user:${from}`).emit('dm', payload);
    this.server.to(`user:${data.to}`).emit('dm', payload);
  }

  @SubscribeMessage('game_chat')
  async handleGameChat(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody() data: { gameId: string; content: string },
  ) {
    const from = socket.data.userId;
    if (!from) return;

    await this.chatService.saveGameMessage(data.gameId, from, data.content);
    this.server
      .to(data.gameId)
      .emit('game_chat', { from, content: data.content });
  }
}
