import { GameState } from './game.state';
import { initialBoard } from '../chess/initialBoard';

export const games = new Map<string, GameState>();

export function createGame(
  gameId: string,
  players: { white: string; black: string },
  timeMs: number,
  incrementMs: number,
) {
  games.set(gameId, {
    board: initialBoard,
    turn: 'white',
    players,
    moveCount: 0,
    time: {
      white: timeMs,
      black: timeMs,
    },
    lastTimestamp: Date.now(),
    increment: incrementMs,
    promotionPending: null,
  });
}

export function getGame(gameId: string) {
  return games.get(gameId);
}

//game for rematch
export const rematchRequests = new Map<
  string,
  {
    from: string;
    to: string;
    timeout?: NodeJS.Timeout;
    requested?: boolean;
    flipped: boolean;
  }
>();
