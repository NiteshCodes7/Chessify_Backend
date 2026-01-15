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
    white: number; // ms remaining
    black: number; // ms remaining
  };
  lastTimestamp: number; // server timestamp ms
  increment: number; // ms per move
};
