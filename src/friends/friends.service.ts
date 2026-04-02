import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendRequestStatus } from 'generated/prisma/client';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(fromId: string, toId: string) {
    if (fromId === toId) throw new BadRequestException('Cannot add yourself');

    const exists = await this.prisma.friendRequest.findFirst({
      where: { fromId, toId, status: FriendRequestStatus.PENDING },
    });

    if (exists) throw new BadRequestException('Request already sent');

    return this.prisma.friendRequest.create({
      data: { fromId, toId },
    });
  }

  async acceptRequest(requestId: string, userId: string) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.toId !== userId)
      throw new BadRequestException('Invalid request');

    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.ACCEPTED },
    });

    // create mutual friendship
    await this.prisma.friendship.createMany({
      data: [
        { userId: request.fromId, friendId: request.toId },
        { userId: request.toId, friendId: request.fromId },
      ],
    });
  }

  async listFriends(userId: string) {
    const friends = await this.prisma.friendship.findMany({
      where: { userId },
      include: { friend: true },
    });
    return friends.map((f) => f.friend);
  }

  async getPendingRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: {
        toId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        from: true,
      },
    });
  }

  async sendRequestByEmail(fromId: string, email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return this.sendRequest(fromId, user.id);
  }
}
