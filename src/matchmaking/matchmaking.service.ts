import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { createGame } from '../game/game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';

type QueuedPlayer = {
  socket: Socket;
};

@Injectable()
export class MatchmakingService {
  constructor(private readonly gamePersistence: GamePersistenceService) {}

  private queue: QueuedPlayer[] = [];

  async addPlayer(socket: Socket) {
    // If someone is already waiting → match
    if (this.queue.length > 0) {
      const opponent = this.queue.shift()!;
      await this.createGame(opponent.socket, socket);
    } else {
      this.queue.push({ socket });
    }
  }

  removePlayer(socketId: string) {
    this.queue = this.queue.filter((p) => p.socket.id !== socketId);
  }

  private async createGame(p1: Socket, p2: Socket) {
    const gameId = randomUUID();

    const white = Math.random() < 0.5 ? p1 : p2;
    const black = white === p1 ? p2 : p1;

    const timeMs = 5 * 60 * 1000;
    const incrementMs = 0;

    createGame(
      gameId,
      {
        white: white.id,
        black: black.id,
      },
      timeMs,
      incrementMs,
    );

    await white.join(gameId);
    await black.join(gameId);

    white.emit('match_found', {
      gameId,
      color: 'white',
      timeMs,
      incrementMs,
      lastTimestamp: Date.now(),
    });

    black.emit('match_found', {
      gameId,
      color: 'black',
      timeMs,
      incrementMs,
      lastTimestamp: Date.now(),
    });

    await this.gamePersistence.createGame(gameId);

    console.log(`Game ${gameId} created`);
  }
}
