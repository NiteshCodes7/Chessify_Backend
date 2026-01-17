import { BoardState } from '../types/chess';

export type GameState = {
  board: BoardState;
  turn: 'white' | 'black';
  players: {
    white: string;
    black: string;
  };
  moveCount: number;
  time: {
    white: number;
    black: number;
  };
  lastTimestamp: number;
  increment: number;
};
