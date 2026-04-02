import { Socket } from 'socket.io';

export type PieceType =
  | 'pawn'
  | 'rook'
  | 'knight'
  | 'bishop'
  | 'queen'
  | 'king';

export type Color = 'white' | 'black';

export type Piece = {
  type: PieceType;
  color: Color;
  hasMoved?: boolean;
};

export type Square = Piece | null;

export type BoardState = Square[][];

//Omit helping to remove data property from Socket io and then replacing it with mine
export type ExtendedSocket = Omit<Socket, 'data'> & {
  data: {
    userId?: string;
  };
};
