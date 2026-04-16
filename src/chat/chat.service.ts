import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  saveDM(from: string, to: string, content: string) {
    return this.prisma.message.create({
      data: { senderId: from, receiverId: to, content },
    });
  }

  saveGameMessage(gameId: string, from: string, content: string) {
    return this.prisma.message.create({
      data: { senderId: from, gameId, content },
    });
  }

  getDMHistory(userA: string, userB: string) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userA, receiverId: userB },
          { senderId: userB, receiverId: userA },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDM(userId: string, friendId: string) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  deleteMessage(messageId: string, userId: string) {
    return this.prisma.message.deleteMany({
      where: {
        id: messageId,
        senderId: userId,
      },
    });
  }
}
