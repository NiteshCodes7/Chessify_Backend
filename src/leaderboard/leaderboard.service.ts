import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      where: {
        username: {
          not: null,
        },
      },
      orderBy: {
        rating: 'desc',
      },
      select: {
        id: true,
        username: true,
        rating: true,
        avatar: true,
      },
    });

    const leaderboard = await Promise.all(
      users.map(async (user) => {
        const wins = await this.prisma.game.count({
          where: {
            OR: [
              {
                whiteId: user.id,
                result: 'WHITE_WIN',
              },
              {
                blackId: user.id,
                result: 'BLACK_WIN',
              },
            ],
          },
        });

        const losses = await this.prisma.game.count({
          where: {
            OR: [
              {
                whiteId: user.id,
                result: 'BLACK_WIN',
              },
              {
                blackId: user.id,
                result: 'WHITE_WIN',
              },
            ],
          },
        });

        const draws = await this.prisma.game.count({
          where: {
            result: 'DRAW',
            OR: [{ whiteId: user.id }, { blackId: user.id }],
          },
        });

        return {
          id: user.id,
          username: user.username,
          rating: user.rating,
          avatar: user.avatar,
          wins,
          losses,
          draws,
        };
      }),
    );

    return leaderboard;
  }
}
