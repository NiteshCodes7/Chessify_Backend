import {
  Injectable,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FriendRequestStatus } from '@prisma/client';
import { PresenceService } from 'src/presence/presence.service';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PresenceService))
    private readonly presenceserv: PresenceService,
  ) {}

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

  async rejectRequest(requestId: string, userId: string) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Request not found');
    }

    if (request.toId !== userId) {
      throw new Error('Not authorized to reject this request');
    }

    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.REJECTED },
    });
  }

  async listFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: { userId },
      include: { friend: true },
    });

    return Promise.all(
      friendships.map(async (f) => {
        const presence = await this.presenceserv.getStatus(f.friendId);

        return {
          id: f.friend.id,
          name: f.friend.name,
          avatar: f.friend.avatar,
          rating: f.friend.rating,
          status: presence.status || 'offline',
          lastSeen: presence.lastSeen ? Number(presence.lastSeen) : null,
        };
      }),
    );
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

  // searchh users live
  async searchUsers(userId: string, q: string) {
    const value = q.trim().toLowerCase();

    if (value.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { username: { contains: value, mode: 'insensitive' } },
          { email: { contains: value, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        rating: true,
      },
      take: 6,
    });

    return users;
  }

  // send friend request
  async sendRequestByIdentifier(fromId: string, identifier: string) {
    const value = identifier.toLowerCase().trim();

    // Detect email vs username
    const isEmail = value.includes('@');

    const user = await this.prisma.user.findFirst({
      where: isEmail ? { email: value } : { username: value },
    });

    if (!user) {
      throw new BadRequestException(
        isEmail
          ? 'User not found with this email'
          : 'User not found with this username',
      );
    }

    if (user.id === fromId) {
      throw new BadRequestException('Cannot add yourself');
    }

    const alreadyFriend = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: fromId, friendId: user.id },
          { userId: user.id, friendId: fromId },
        ],
      },
    });

    if (alreadyFriend) {
      throw new BadRequestException('Already friends');
    }

    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { fromId, toId: user.id },
          { fromId: user.id, toId: fromId },
        ],
        status: FriendRequestStatus.PENDING,
      },
    });

    if (existingRequest) {
      throw new BadRequestException('Request already exists');
    }

    return this.sendRequest(fromId, user.id);
  }

  // unfriend
  async unfriend(userId: string, friendId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: { userId, friendId },
    });

    if (!friendship) throw new BadRequestException('Not friends');

    // Delete both directions
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    return { message: 'Unfriended successfully' };
  }
}
