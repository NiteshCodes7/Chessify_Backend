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
import { getGame } from './game.store';
import { GamePersistenceService } from '../game-persistence/game-persistence.service';
import { GameResult } from 'generated/prisma/client';
import { getGameStatus } from 'src/chess/getGameStatus';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:3000',
  },
})
export class GameGateway {
  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly gamePersistence: GamePersistenceService,
  ) {}

  @WebSocketServer()
  server: Server;

  // 🧠 When a client connects
  handleConnection(socket: Socket) {
    console.log('Client connected:', socket.id);
  }

  // 🧠 When a client disconnects
  handleDisconnect(socket: Socket) {
    this.matchmaking.removePlayer(socket.id);
    console.log('Client disconnected:', socket.id);
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
    @ConnectedSocket() socket: Socket,
  ) {
    await socket.join(gameId);
    console.log(`Socket ${socket.id} joined game ${gameId}`);
  }

  // ♟️ Relay move to opponent
  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    data: {
      gameId: string;
      from: { row: number; col: number };
      to: { row: number; col: number };
    },
  ) {
    const game = getGame(data.gameId);
    if (!game) return;

    // Auth expected in this as white: usedId1 and black: userId2
    // const expectedSocketId =
    //   game.turn === 'white' ? game.players.white : game.players.black;

    // if (socket.id !== expectedSocketId) {
    //   return;
    // }

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
    game.turn = nextTurn;
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
      await this.gamePersistence.endGame(
        data.gameId,
        status.winner === 'white' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN,
      );
    }

    if (status.state === 'stalemate') {
      await this.gamePersistence.endGame(data.gameId, GameResult.DRAW);
    }
  }

  // 🕛 Update winner in database
  private async endOnTimeout(gameId: string, winner: 'white' | 'black') {
    this.server.to(gameId).emit('timeout', { winner });

    await this.gamePersistence.endGame(
      gameId,
      winner === 'white' ? 'WHITE_WIN' : 'BLACK_WIN',
    );

    console.log(`Game ${gameId} ended on time. Winner: ${winner}`);
  }
}
