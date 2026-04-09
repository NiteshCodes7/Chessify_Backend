import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createGame } from '../game/game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { playerGameMap } from 'src/game/player-map';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from 'src/presence/presence.service';

type QueuedPlayer = {
  socket: Socket;
  userId: string;
  rating: number;
  joinedAt?: number;
};

const QUEUE_TIMEOUT_MS = 60000;
const TOLERANCE = 500;

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly gamePersistence: GamePersistenceService,
    private readonly presenceService: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  private queue: QueuedPlayer[] = [];

  // Add Players
  async addPlayer(socket: Socket) {
    const { userId } = socket.data as { userId?: string };
    if (!userId) {
      return;
    }

    // Same player joining twice
    if (this.queue.find((p) => p.userId === userId)) {
      return;
    }

    // check if there ban n userId
    const banRemaining = await this.presenceService.getBan(userId);
    if (banRemaining) {
      socket.emit('banned', {
        reason: 'You abandoned a game',
        remainingMs: banRemaining,
      });
      return;
    }

    const playerRating = await this.getRating(userId);
    const joinedAt = Date.now();

    // remove timed-out players first
    this.clearTimeouts();

    // search for compatible opponent
    const idx = this.queue.findIndex((p) => {
      return (
        p.socket.id !== socket.id &&
        Math.abs(playerRating - p.rating) <= TOLERANCE
      );
    });

    if (idx >= 0) {
      const opponent = this.queue.splice(idx, 1)[0];
      await this.createGame(opponent, { socket, userId, rating: playerRating });
    } else {
      if (this.queue.find((p) => p.userId === userId)) return;
      this.queue.push({ socket, userId, rating: playerRating, joinedAt });
    }

    // schedule removal
    setTimeout(() => {
      this.removeIfStillQueued(socket);
    }, QUEUE_TIMEOUT_MS);

    socket.removeAllListeners('cancel_match');
    socket.on('cancel_match', () => {
      this.queue = this.queue.filter((p) => p.socket.id !== socket.id);
      socket.emit('match_canceled');
    });
  }

  removePlayer(socketId: string) {
    this.queue = this.queue.filter((p) => p.socket.id !== socketId);
  }

  private async getRating(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.rating ?? 1200;
  }

  private clearTimeouts() {
    const now = Date.now();
    this.queue = this.queue.filter((p) => {
      const expired = now - p.joinedAt! > QUEUE_TIMEOUT_MS;
      if (expired) {
        p.socket.emit('match_timeout');
      }
      return !expired;
    });
  }

  private removeIfStillQueued(socket: Socket) {
    const idx = this.queue.findIndex((p) => p.socket.id === socket.id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      socket.emit('match_timeout');
    }
  }

  private async createGame(p1: QueuedPlayer, p2: QueuedPlayer) {
    const gameId = randomUUID();

    const white = Math.random() < 0.5 ? p1 : p2;
    const black = white === p1 ? p2 : p1;

    const timeMs = 5 * 60 * 1000;
    const incrementMs = 0;

    createGame(
      gameId,
      {
        white: white.userId,
        black: black.userId,
      },
      timeMs,
      incrementMs,
    );

    await white.socket.join(gameId);
    await black.socket.join(gameId);

    white.socket.emit('match_found', {
      gameId,
      color: 'white',
      timeMs,
      incrementMs,
      lastTimestamp: Date.now(),
    });

    black.socket.emit('match_found', {
      gameId,
      color: 'black',
      timeMs,
      incrementMs,
      lastTimestamp: Date.now(),
    });

    playerGameMap.set(white.userId, { gameId, color: 'white' });
    playerGameMap.set(black.userId, { gameId, color: 'black' });

    await this.gamePersistence.createGame(gameId, white.userId, black.userId);

    console.log(`Game ${gameId} created`);
  }

  async createDirectMatch(whiteId: string, blackId: string) {
    const gameId = randomUUID();

    const timeMs = 5 * 60 * 1000;
    const incrementMs = 0;

    createGame(
      gameId,
      {
        white: whiteId,
        black: blackId,
      },
      timeMs,
      incrementMs,
    );

    if (playerGameMap.has(whiteId) || playerGameMap.has(blackId)) {
      return;
    }

    playerGameMap.set(whiteId, { gameId, color: 'white' });
    playerGameMap.set(blackId, { gameId, color: 'black' });

    await this.gamePersistence.createGame(gameId, whiteId, blackId);

    return {
      gameId,
      players: {
        white: whiteId,
        black: blackId,
      },
      timeMs,
      incrementMs,
      lastTimestamp: Date.now(),
    };
  }
}
