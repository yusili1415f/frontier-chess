import { BOARD_SIZE, Board, FILES, PlayerSide, Position } from "./types";

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, rowIndex) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => ({
      position: { col, row: rowIndex + 1 },
    })),
  );
}

export function isInsideBoard(position: Position): boolean {
  return position.col >= 0 && position.col < BOARD_SIZE && position.row >= 1 && position.row <= BOARD_SIZE;
}

export function getSquare(board: Board, position: Position) {
  if (!isInsideBoard(position)) {
    return undefined;
  }
  return board[position.row - 1][position.col];
}

export function setPieceAt(board: Board, position: Position, pieceId?: string): Board {
  return board.map((rank) =>
    rank.map((square) =>
      samePosition(square.position, position)
        ? {
            ...square,
            pieceId,
          }
        : square,
    ),
  );
}

export function getPiecePosition(board: Board, pieceId: string): Position | undefined {
  for (const rank of board) {
    for (const square of rank) {
      if (square.pieceId === pieceId) {
        return square.position;
      }
    }
  }
  return undefined;
}

export function coordinateLabel(position: Position): string {
  return `${FILES[position.col]}${position.row}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

export function isOrthogonallyAligned(from: Position, to: Position): boolean {
  return from.col === to.col || from.row === to.row;
}

export function isDiagonallyAligned(from: Position, to: Position): boolean {
  return Math.abs(from.col - to.col) === Math.abs(from.row - to.row);
}

export function getSquaresBetween(from: Position, to: Position): Position[] {
  if (!isOrthogonallyAligned(from, to) && !isDiagonallyAligned(from, to)) {
    return [];
  }

  const colStep = Math.sign(to.col - from.col);
  const rowStep = Math.sign(to.row - from.row);
  const squares: Position[] = [];
  let col = from.col + colStep;
  let row = from.row + rowStep;

  while (col !== to.col || row !== to.row) {
    squares.push({ col, row });
    col += colStep;
    row += rowStep;
  }

  return squares;
}

export function isFrontierZone(position: Position): boolean {
  return position.row >= 3 && position.row <= 5;
}

export function isFrontierLine(position: Position): boolean {
  return position.row === 4;
}

export function isHomeTerritory(side: PlayerSide, position: Position): boolean {
  return side === "Blue" ? position.row <= 2 : position.row >= 6;
}

export function hasPawnCrossedFrontier(side: PlayerSide, position: Position): boolean {
  return side === "Blue" ? position.row >= 5 : position.row <= 3;
}

export function cloneBoard(board: Board): Board {
  return board.map((rank) => rank.map((square) => ({ ...square, position: { ...square.position } })));
}
