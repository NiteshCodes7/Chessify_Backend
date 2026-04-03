import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { isMoveLegal } from '../chess/isMoveLegal';
import { games, getGame } from './game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { GameResult } from 'generated/prisma/client';
import { getGameStatus } from 'src/chess/getGameStatus';
import { playerGameMap } from './player-map';
import { JwtService } from '@nestjs/jwt';
import { RatingService } from 'src/rating/rating.service';
import { BoardState } from 'src/types/chess';
import { PresenceService } from 'src/presence/presence.service';
import type { ExtendedSocket } from 'src/types/chess';

@WebSocketGateway({
  namespace: '/game',
  cors: { origin: 'http://localhost:3000', credentials: true },
})
export class GameGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly gamePersistence: GamePersistenceService,
    private readonly ratingService: RatingService,
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
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

      console.log(`[game] connected: ${payload.sub}`);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;
    this.matchmaking.removePlayer(socket.id);
    console.log(`[game] disconnected: ${socket.id}`);
  }

  @SubscribeMessage('find_match')
  async handleFindMatch(@ConnectedSocket() socket: Socket) {
    await this.matchmaking.addPlayer(socket);
  }

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @MessageBody() gameId: string,
    @ConnectedSocket() socket: ExtendedSocket,
  ) {
    await socket.join(gameId);
    const userId = socket.data.userId;

    if (userId) {
      await this.presence.setStatus(userId, 'playing');
      // Emit to presence namespace so friends see the update
      this.server.to(`user:${userId}`).emit('presence_update', {
        userId,
        status: 'playing',
      });
    }
  }

  @SubscribeMessage('reconnect')
  async handleReconnect(@ConnectedSocket() socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;

    const data = playerGameMap.get(userId);
    if (!data) return socket.emit('no_active_game');

    const { gameId, color } = data;
    const game = getGame(gameId);
    if (!game) return socket.emit('no_active_game');

    await socket.join(gameId);

    socket.emit('reconnected', {
      gameId,
      color,
      board: game.board,
      turn: game.turn,
      time: game.time,
      lastTimestamp: game.lastTimestamp,
      promotionPending: game.promotionPending ?? null,
    });
  }

  @SubscribeMessage('spectate')
  async handleSpectate(
    @MessageBody() gameId: string,
    @ConnectedSocket() socket: ExtendedSocket,
  ) {
    const game = getGame(gameId);
    if (!game) return;

    const isPlayerInAnyGame = [...games.values()].some(
      (g) =>
        g.players.white === socket.data.userId ||
        g.players.black === socket.data.userId,
    );

    if (isPlayerInAnyGame) return;

    await socket.join(gameId);

    socket.emit('state_update', {
      board: game.board,
      turn: game.turn,
      time: game.time,
      lastTimestamp: game.lastTimestamp,
      promotionPending: game.promotionPending ?? null,
    });
  }

  @SubscribeMessage('promote')
  handlePromotion(
    @MessageBody()
    data: {
      gameId: string;
      position: { row: number; col: number };
      pieceType: 'queen' | 'rook' | 'bishop' | 'knight';
      newBoard: BoardState;
    },
  ) {
    const { gameId, position, pieceType, newBoard } = data;
    const game = getGame(gameId);
    if (!game) return;

    const { row, col } = position;
    const pawn = game.board[row][col];
    if (!pawn || pawn.type !== 'pawn') return;

    const now = Date.now();
    const elapsed = now - game.lastTimestamp;

    if (game.turn === 'white') {
      game.time.white -= elapsed;
      if (game.time.white <= 0) return this.endOnTimeout(gameId, 'black');
      game.time.white += game.increment;
    } else {
      game.time.black -= elapsed;
      if (game.time.black <= 0) return this.endOnTimeout(gameId, 'white');
      game.time.black += game.increment;
    }

    game.turn = game.turn === 'white' ? 'black' : 'white';
    game.lastTimestamp = now;
    game.promotionPending = null;

    const status = getGameStatus(newBoard, game.turn);

    game.board[row][col] = {
      type: pieceType,
      color: pawn.color,
      hasMoved: true,
    };

    this.server.to(gameId).emit('authoritative_move', {
      board: game.board,
      turn: game.turn,
      time: game.time,
      lastTimestamp: game.lastTimestamp,
      promotionPending: game.promotionPending,
      status,
    });
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody()
    data: {
      gameId: string;
      from: { row: number; col: number };
      to: { row: number; col: number };
    },
  ) {
    const game = getGame(data.gameId);
    if (!game) return;

    const userId = socket.data.userId;
    if (!userId) return;

    const isWhiteTurn = game.turn === 'white';
    const isBlackTurn = game.turn === 'black';

    if (isWhiteTurn && userId !== game.players.white)
      return socket.emit('move_denied', { reason: 'Not your turn (white)' });

    if (isBlackTurn && userId !== game.players.black)
      return socket.emit('move_denied', { reason: 'Not your turn (black)' });

    const { board, turn } = game;
    const piece = board[data.from.row][data.from.col];

    if (!piece || piece.color !== turn) return;

    if (
      !isMoveLegal(
        board,
        data.from.row,
        data.from.col,
        data.to.row,
        data.to.col,
        turn,
      )
    )
      return;

    const newBoard = board.map((r) => r.slice());

    if (
      piece.type === 'pawn' &&
      ((piece.color === 'white' && data.to.row === 0) ||
        (piece.color === 'black' && data.to.row === 7))
    ) {
      newBoard[data.to.row][data.to.col] = { ...piece, hasMoved: true };
      newBoard[data.from.row][data.from.col] = null;
      game.board = newBoard;
      game.moveCount++;

      this.server.to(data.gameId).emit('authoritative_move', {
        from: data.from,
        to: data.to,
        board: newBoard,
        turn: game.turn,
        promotionPending: game.promotionPending,
        time: game.time,
        lastTimestamp: game.lastTimestamp,
        status: 'promotion',
      });

      this.server.to(data.gameId).emit('promotion_needed', {
        gameId: data.gameId,
        color: piece.color,
        position: { row: data.to.row, col: data.to.col },
      });

      return;
    }

    if (piece.type === 'king' && Math.abs(data.from.col - data.to.col) === 2) {
      const rookFromCol = data.to.col === 6 ? 7 : 0;
      const rookToCol = data.to.col === 6 ? 5 : 3;
      const rook = newBoard[data.from.row][rookFromCol];
      if (!rook) return;
      newBoard[data.from.row][rookToCol] = { ...rook, hasMoved: true };
      newBoard[data.from.row][rookFromCol] = null;
    }

    newBoard[data.to.row][data.to.col] = { ...piece, hasMoved: true };
    newBoard[data.from.row][data.from.col] = null;

    const nextTurn = turn === 'white' ? 'black' : 'white';
    const now = Date.now();
    const elapsed = now - game.lastTimestamp;

    if (game.turn === 'white') {
      game.time.white -= elapsed;
      if (game.time.white <= 0) return this.endOnTimeout(data.gameId, 'black');
      game.time.white += game.increment;
    } else {
      game.time.black -= elapsed;
      if (game.time.black <= 0) return this.endOnTimeout(data.gameId, 'white');
      game.time.black += game.increment;
    }

    game.lastTimestamp = now;
    game.board = newBoard;
    game.turn = nextTurn;
    game.moveCount++;

    const status = getGameStatus(newBoard, nextTurn);

    this.server.to(data.gameId).emit('authoritative_move', {
      from: data.from,
      to: data.to,
      board: newBoard,
      turn: nextTurn,
      time: game.time,
      lastTimestamp: game.lastTimestamp,
      status,
    });

    this.server.to(data.gameId).emit('state_update', {
      board: newBoard,
      turn: nextTurn,
      time: game.time,
      lastTimestamp: game.lastTimestamp,
    });

    await this.gamePersistence.saveMove(
      data.gameId,
      game.moveCount,
      data.from,
      data.to,
    );

    if (status.state === 'checkmate') {
      await this.endGame(
        data.gameId,
        status.winner === 'white' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN,
        status.winner === 'white' ? 'white' : 'black',
        game.players,
      );
    }

    if (status.state === 'stalemate') {
      await this.endGame(data.gameId, GameResult.DRAW, 'draw', game.players);
    }
  }

  private async endGame(
    gameId: string,
    result: GameResult,
    winner: 'white' | 'black' | 'draw',
    players: { white: string; black: string },
  ) {
    await this.gamePersistence.endGame(gameId, result);
    await this.ratingService.updateRatings(gameId, winner);

    playerGameMap.delete(players.white);
    playerGameMap.delete(players.black);

    await this.presence.setStatus(players.white, 'online');
    await this.presence.setStatus(players.black, 'online');

    // Emit to presence namespace rooms
    this.server
      .to(`user:${players.white}`)
      .emit('presence_update', { userId: players.white, status: 'online' });
    this.server
      .to(`user:${players.black}`)
      .emit('presence_update', { userId: players.black, status: 'online' });

    games.delete(gameId);
  }

  private async endOnTimeout(gameId: string, winner: 'white' | 'black') {
    this.server.to(gameId).emit('timeout', { winner });

    const game = getGame(gameId);
    if (!game) return;

    await this.endGame(
      gameId,
      winner === 'white' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN,
      winner,
      game.players,
    );

    console.log(`[game] ${gameId} ended on timeout. Winner: ${winner}`);
  }
}
