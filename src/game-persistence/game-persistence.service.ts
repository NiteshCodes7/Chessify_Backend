import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameEndReason, GameResult } from '@prisma/client';

@Injectable()
export class GamePersistenceService {
  constructor(private readonly prisma: PrismaService) {}
  async createGame(gameId: string, whiteId: string, blackId: string) {
    await this.prisma.game.create({
      data: { id: gameId, whiteId, blackId },
    });
  }

  async saveMove(
    gameId: string,
    moveIndex: number,
    from: { row: number; col: number },
    to: { row: number; col: number },
  ) {
    await this.prisma.move.create({
      data: {
        gameId,
        moveIndex,
        fromRow: from.row,
        fromCol: from.col,
        toRow: to.row,
        toCol: to.col,
      },
    });
  }

  async endGame(gameId: string, result: GameResult, endReason: GameEndReason) {
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        result,
        endReason,
        endedAt: new Date(),
      },
    });
  }

  async getAllGames(userId: string) {
    return this.prisma.game.findMany({
      where: {
        OR: [{ whiteId: userId }, { blackId: userId }],
      },
      include: {
        white: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        black: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            moves: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getGame(gameId: string) {
    return this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        moves: { orderBy: { moveIndex: 'asc' } },
      },
    });
  }
}
