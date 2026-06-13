import { Piece, Position } from "./types";

export function canPromote(piece: Piece): boolean {
  return piece.type === "Pawn" || piece.type === "Guard";
}

export function hasCrossedFrontierLine(piece: Piece, square: Position): boolean {
  return piece.side === "Blue" ? square.row >= 5 : square.row <= 3;
}

export function shouldPromote(piece: Piece, destination: Position): boolean {
  return canPromote(piece) && !piece.promoted && hasCrossedFrontierLine(piece, destination);
}

export function applyPromotionIfNeeded(piece: Piece, destination: Position): Piece {
  if (shouldPromote(piece, destination)) {
    return { ...piece, promoted: true };
  }

  return { ...piece };
}
