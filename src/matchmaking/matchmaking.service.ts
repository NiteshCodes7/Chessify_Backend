import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createGame } from '../game/game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { playerGameMap } from 'src/game/player-map';

type QueuedPlayer = {
  socket: Socket;
  userId: string;
};

@Injectable()
export class MatchmakingService {
  constructor(private readonly gamePersistence: GamePersistenceService) {}

  private queue: QueuedPlayer[] = [];

  async addPlayer(socket: Socket) {
    const { userId } = socket.data as { userId?: string };
    if (!userId) return;
    // If someone is already waiting → match
    if (this.queue.find((p) => p.userId === userId)) return;

    if (this.queue.length > 0) {
      const opponent = this.queue.shift()!;
      await this.createGame(opponent, { socket, userId });
    } else {
      this.queue.push({ socket, userId });
    }
  }

  removePlayer(socketId: string) {
    this.queue = this.queue.filter((p) => p.socket.id !== socketId);
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
}
