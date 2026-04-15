import { BoardState } from '../types/chess';
import { getGameStatus } from './getGameStatus';

type Position = { row: number; col: number };

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function square(row: number, col: number) {
  return `${FILES[col]}${8 - row}`;
}

function pieceLetter(type: string) {
  switch (type) {
    case 'king':
      return 'K';
    case 'queen':
      return 'Q';
    case 'rook':
      return 'R';
    case 'bishop':
      return 'B';
    case 'knight':
      return 'N';
    default:
      return '';
  }
}

export function getSan(
  board: BoardState,
  from: Position,
  to: Position,
  promotion?: 'queen' | 'rook' | 'bishop' | 'knight',
): string {
  const piece = board[from.row][from.col];
  if (!piece) return '';

  const target = board[to.row][to.col];
  const isCapture = !!target;

  // Castling
  if (piece.type === 'king' && Math.abs(from.col - to.col) === 2) {
    const castle = to.col === 6 ? 'O-O' : 'O-O-O';

    const newBoard = board.map((r) => r.slice());
    newBoard[to.row][to.col] = { ...piece, hasMoved: true };
    newBoard[from.row][from.col] = null;

    const nextTurn = piece.color === 'white' ? 'black' : 'white';
    const status = getGameStatus(newBoard, nextTurn);

    if (status.state === 'checkmate') return castle + '#';
    if (status.state === 'check') return castle + '+';

    return castle;
  }

  let san = '';

  // Piece letter
  san += pieceLetter(piece.type);

  // Pawn capture includes file letter
  if (piece.type === 'pawn' && isCapture) {
    san += FILES[from.col];
  }

  // Capture mark
  if (isCapture) {
    san += 'x';
  }

  // Destination square
  san += square(to.row, to.col);

  // Promotion
  if (promotion) {
    san += '=' + pieceLetter(promotion);
  }

  // Simulate move
  const newBoard = board.map((r) => r.slice());

  newBoard[to.row][to.col] = {
    ...piece,
    type: promotion ?? piece.type,
    hasMoved: true,
  };

  newBoard[from.row][from.col] = null;

  const nextTurn = piece.color === 'white' ? 'black' : 'white';
  const status = getGameStatus(newBoard, nextTurn);

  if (status.state === 'checkmate') san += '#';
  else if (status.state === 'check') san += '+';

  return san;
}
