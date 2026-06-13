import { createEmptyBoard, setPieceAt } from "./board";
import { Board, Piece, PieceType, PlayerSide, Position } from "./types";

type SetupPiece = {
  side: PlayerSide;
  type: PieceType;
  position: Position;
};

const STARTING_SETUP: SetupPiece[] = [
  ...rankSetup("Blue", 1, ["Rook", "Knight", "Cannon", "King", "Bishop", "Knight", "Rook"]),
  ...rankSetup("Blue", 2, ["Pawn", "Pawn", "Pawn", "Guard", "Pawn", "Pawn", "Pawn"]),
  ...rankSetup("Red", 7, ["Rook", "Knight", "Bishop", "King", "Cannon", "Knight", "Rook"]),
  ...rankSetup("Red", 6, ["Pawn", "Pawn", "Pawn", "Guard", "Pawn", "Pawn", "Pawn"]),
];

export function createStartingPosition(): { board: Board; pieces: Record<string, Piece> } {
  let board = createEmptyBoard();
  const pieces: Record<string, Piece> = {};

  STARTING_SETUP.forEach((entry, index) => {
    const id = `${entry.side}-${entry.type}-${index}`;
    pieces[id] = {
      id,
      side: entry.side,
      type: entry.type,
    };
    board = setPieceAt(board, entry.position, id);
  });

  return { board, pieces };
}

function rankSetup(side: PlayerSide, row: number, types: PieceType[]): SetupPiece[] {
  return types.map((type, col) => ({
    side,
    type,
    position: { col, row },
  }));
}
