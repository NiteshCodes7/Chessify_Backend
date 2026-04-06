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
import { games, getGame, rematchRequests } from './game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { GameResult } from 'generated/prisma/client';
import { getGameStatus } from 'src/chess/getGameStatus';
import { playerGameMap } from './player-map';
import { JwtService } from '@nestjs/jwt';
import { RatingService } from 'src/rating/rating.service';
import { BoardState } from 'src/types/chess';
import { PresenceService } from 'src/presence/presence.service';
import type { ExtendedSocket } from 'src/types/chess';
import { PresenceGateway } from 'src/presence/presence.gateway';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
    credentials: true,
  },
})
export class GameGateway {
  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly gamePersistence: GamePersistenceService,
    private readonly ratingService: RatingService,
    private readonly jwt: JwtService,
    private readonly presence: PresenceService,
    private readonly presenceGateway: PresenceGateway,
  ) {}

  @WebSocketServer()
  server!: Server;

  private abandonTimers = new Map<string, NodeJS.Timeout>();

  // 🧠 When a client connects
  async handleConnection(socket: ExtendedSocket) {
    const auth = socket.handshake?.auth as { wsToken?: unknown } | undefined;
    const token = typeof auth?.wsToken === 'string' ? auth.wsToken : undefined;

    try {
      if (!token) {
        socket.emit('ws_unauthorized', { reason: 'missing_ws_token' });
        return socket.disconnect();
      }

      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: process.env.JWT_WS_SECRET!,
      });

      const userId = payload.sub;

      socket.data.userId = userId;

      await socket.join(`user:${userId}`);

      // Cancel abandon timer if they reconnect
      const existingTimer = this.abandonTimers.get(userId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.abandonTimers.delete(userId);
        console.log(`[game] ${userId} reconnected, cancelled abandon timer`);

        // Notify opponent they're back
        const gameData = playerGameMap.get(userId);
        if (gameData) {
          const game = getGame(gameData.gameId);
          if (game) {
            const opponentId =
              game.players.white === userId
                ? game.players.black
                : game.players.white;
            this.server.to(`user:${opponentId}`).emit('opponent_reconnected');
          }
        }
      }

      // Check if user has an active ban
      const banRemaining = await this.presence.getBan(userId);
      if (banRemaining) {
        socket.emit('banned', {
          reason: 'You abandoned a game',
          remainingMs: banRemaining,
        });
      }

      console.log(`WS connected: user=${userId}`);
    } catch (e) {
      console.log('WS auth failed', e);
      socket.emit('ws_unauthorized', { reason: 'invalid_or_expired' });
      socket.disconnect();
    }
  }

  // 🧠 When a client disconnects
  handleDisconnect(socket: ExtendedSocket) {
    const userId = socket.data.userId;
    if (!userId) return;

    this.matchmaking.removePlayer(socket.id);

    // Check if user is in an active game
    const gameData = playerGameMap.get(userId);
    if (!gameData) return;

    const game = getGame(gameData.gameId);
    if (!game) return;

    console.log(
      `[game] ${userId} disconnected during game ${gameData.gameId}, starting abandon timer`,
    );

    // Notify opponent
    const opponentId =
      game.players.white === userId ? game.players.black : game.players.white;

    this.server.to(`user:${opponentId}`).emit('opponent_disconnected');

    // Start 30s abandon timer
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const timer = setTimeout(async () => {
      this.abandonTimers.delete(userId);

      // Check if still disconnected
      const roomSockets = await this.server.in(`user:${userId}`).fetchSockets();
      if (roomSockets.length > 0) return; // reconnected, ignore

      console.log(`[game] ${userId} abandoned game ${gameData.gameId}`);

      const winner = game.players.white === userId ? 'black' : 'white';
      await this.finalizeGame(gameData.gameId, 'abandoned', winner);
    }, 30000);

    this.abandonTimers.set(userId, timer);
  }

  // ➕ add player to join the game
  @SubscribeMessage('find_match')
  async handleFindMatch(@ConnectedSocket() socket: Socket) {
    await this.matchmaking.addPlayer(socket);
  }

  // 🏠 Join a game room
  @SubscribeMessage('join_game')
  async handleJoinGame(
    @MessageBody() gameId: string,
    @ConnectedSocket() socket: ExtendedSocket,
  ) {
    const game = getGame(gameId);
    if (!game) {
      socket.emit('no_active_game');
      return;
    }
    await socket.join(gameId);
    console.log(`Socket ${socket.id} joined game ${gameId}`);
    const userId = socket.data.userId;
    if (userId) {
      await this.presence.setStatus(userId, 'playing');

      await this.presenceGateway.emitToFriends(userId, 'presence_update', {
        userId,
        status: 'playing',
      });
    }
  }

  @SubscribeMessage('rematch_request')
  handleRematchRequest(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody() { gameId }: { gameId: string },
  ) {
    const userId = socket.data.userId;
    if (!userId) return;

    const request = rematchRequests.get(gameId);
    if (!request) return;

    // Prevent duplicate requests
    if (request.requested) return;
    request.requested = true;

    // Figure out who the opponent is
    const opponentId = request.from === userId ? request.to : request.from;

    // Start timeout
    const timeout = setTimeout(() => {
      this.server.to(`user:${userId}`).emit('rematch_timeout');
      this.server.to(`user:${opponentId}`).emit('rematch_expired');
      rematchRequests.delete(gameId);
    }, 10000);

    request.timeout = timeout;
    rematchRequests.set(gameId, request);

    // Notify opponent immediately
    this.server.to(`user:${opponentId}`).emit('rematch_offer', {
      gameId,
      from: userId,
    });

    // Notify sender they're waiting
    this.server.to(`user:${userId}`).emit('rematch_waiting');
  }

  @SubscribeMessage('rematch_response')
  async handleRematchResponse(
    @ConnectedSocket() socket: ExtendedSocket,
    @MessageBody() data: { gameId: string; accept: boolean },
  ) {
    const userId = socket.data.userId;
    if (!userId) return;

    const request = rematchRequests.get(data.gameId);
    if (!request) return;

    if (request.timeout) clearTimeout(request.timeout);

    // Figure out who requested and who is responding
    const requesterId = request.from === userId ? request.to : request.from;

    // Only the non-requester can respond
    // But since we now use requested flag, just check they're not the same
    if (requesterId === userId) return;

    if (!data.accept) {
      this.server.to(`user:${requesterId}`).emit('rematch_rejected');
      rematchRequests.delete(data.gameId);
      return;
    }

    rematchRequests.delete(data.gameId);

    const newGame = await this.matchmaking.createDirectMatch(
      request.from,
      request.to,
    );

    if (!newGame) {
      this.server.to(`user:${request.from}`).emit('rematch_failed');
      this.server.to(`user:${request.to}`).emit('rematch_failed');
      return;
    }

    this.server.to(`user:${request.from}`).emit('match_found', {
      gameId: newGame.gameId,
      color: newGame.players.white === request.from ? 'white' : 'black',
      timeMs: newGame.timeMs,
      incrementMs: newGame.incrementMs,
      lastTimestamp: newGame.lastTimestamp,
    });

    this.server.to(`user:${request.to}`).emit('match_found', {
      gameId: newGame.gameId,
      color: newGame.players.white === request.to ? 'white' : 'black',
      timeMs: newGame.timeMs,
      incrementMs: newGame.incrementMs,
      lastTimestamp: newGame.lastTimestamp,
    });
  }

  // 🔗 Reconnect user if refreshed or connection lost
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

  // 👓 Spectators connection
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

    // Send current state immediately
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
      if (game.time.white <= 0) {
        return this.endOnTimeout(data.gameId, 'black');
      }
      game.time.white += game.increment;
    } else {
      game.time.black -= elapsed;
      if (game.time.black <= 0) {
        return this.endOnTimeout(data.gameId, 'white');
      }
      game.time.black += game.increment;
    }

    game.turn = game.turn === 'white' ? 'black' : 'white';
    game.lastTimestamp = now;
    game.promotionPending = null;

    const status = getGameStatus(newBoard, game.turn);

    if (status.state === 'checkmate') {
      return this.finalizeGame(gameId, 'checkmate', status.winner);
    }

    if (status.state === 'stalemate') {
      return this.finalizeGame(gameId, 'stalemate', null);
    }

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

  // ♟️ Relay move to opponent
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

    // Enforce turn ownership
    const isWhiteTurn = game.turn === 'white';
    const isBlackTurn = game.turn === 'black';

    if (isWhiteTurn && userId !== game.players.white) {
      return socket.emit('move_denied', { reason: 'Not your turn (white)' });
    }

    if (isBlackTurn && userId !== game.players.black) {
      return socket.emit('move_denied', { reason: 'Not your turn (black)' });
    }

    const { board, turn } = game;
    const piece = board[data.from.row][data.from.col];

    // ❌ Invalid piece
    if (!piece || piece.color !== turn) return;

    // ❌ Illegal move
    if (
      !isMoveLegal(
        board,
        data.from.row,
        data.from.col,
        data.to.row,
        data.to.col,
        turn,
      )
    ) {
      return;
    }

    // ✅ Apply move
    const newBoard = board.map((r) => r.slice());

    // Pawn promotion detection
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

    // Castling
    if (piece.type === 'king' && Math.abs(data.from.col - data.to.col) === 2) {
      const rookFromCol = data.to.col === 6 ? 7 : 0;
      const rookToCol = data.to.col === 6 ? 5 : 3;

      const rook = newBoard[data.from.row][rookFromCol];
      if (!rook) return;

      newBoard[data.from.row][rookToCol] = {
        ...rook,
        hasMoved: true,
      };
      newBoard[data.from.row][rookFromCol] = null;
    }

    newBoard[data.to.row][data.to.col] = {
      ...piece,
      hasMoved: true,
    };
    newBoard[data.from.row][data.from.col] = null;

    const nextTurn = turn === 'white' ? 'black' : 'white';

    // 🕛 Timeout logic
    const now = Date.now();
    const elapsed = now - game.lastTimestamp;

    if (game.turn === 'white') {
      game.time.white -= elapsed;
      if (game.time.white <= 0) {
        return this.endOnTimeout(data.gameId, 'black');
      }
      game.time.white += game.increment;
    } else {
      game.time.black -= elapsed;
      if (game.time.black <= 0) {
        return this.endOnTimeout(data.gameId, 'white');
      }
      game.time.black += game.increment;
    }

    game.lastTimestamp = now;
    game.board = newBoard;
    game.turn = nextTurn;
    game.moveCount++;

    const status = getGameStatus(newBoard, nextTurn);

    // 🔔 Broadcast authoritative move
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

    // 🛑 End game ONLY for terminal states
    if (status.state === 'checkmate') {
      return this.finalizeGame(data.gameId, 'checkmate', status.winner);
    }

    if (status.state === 'stalemate') {
      return this.finalizeGame(data.gameId, 'stalemate', null);
    }
  }

  private async finalizeGame(
    gameId: string,
    state: 'checkmate' | 'stalemate' | 'timeout' | 'abandoned',
    winner: 'white' | 'black' | null,
  ) {
    this.server.to(gameId).emit('game_over', { state, winner });

    let result: GameResult;
    if (state === 'stalemate') result = GameResult.DRAW;
    else
      result = winner === 'white' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN;

    await this.gamePersistence.endGame(gameId, result);

    if (state !== 'stalemate') {
      await this.ratingService.updateRatings(gameId, winner!);
    } else {
      await this.ratingService.updateRatings(gameId, 'draw');
    }

    const game = getGame(gameId);
    if (game) {
      // Apply ban to abandoner
      if (state === 'abandoned' && winner) {
        const abandonerId =
          winner === 'white' ? game.players.black : game.players.white;
        const BAN_DURATION = 2 * 60 * 1000; // 2 minutes
        await this.presence.setBan(abandonerId, BAN_DURATION);
        console.log(`[game] banned ${abandonerId} for ${BAN_DURATION / 1000}s`);
      }
      playerGameMap.delete(game.players.white);
      playerGameMap.delete(game.players.black);

      await this.presence.setStatus(game.players.white, 'online');
      await this.presence.setStatus(game.players.black, 'online');

      await this.presenceGateway.emitToFriends(
        game.players.white,
        'presence_update',
        {
          userId: game.players.white,
          status: 'online',
        },
      );
      await this.presenceGateway.emitToFriends(
        game.players.black,
        'presence_update',
        {
          userId: game.players.black,
          status: 'online',
        },
      );

      if (state !== 'abandoned') {
        rematchRequests.set(gameId, {
          from: game.players.white,
          to: game.players.black,
        });
      }
    }

    games.delete(gameId);
  }

  // 🕛 Update winner in database
  private async endOnTimeout(gameId: string, winner: 'white' | 'black') {
    await this.finalizeGame(gameId, 'timeout', winner);
  }
}
