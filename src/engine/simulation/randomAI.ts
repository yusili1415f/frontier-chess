import { getPiecePosition } from "../board";
import { getLegalMovesForPiece } from "../movement";
import { GameState, LegalMove, PlayerSide } from "../types";

export type LegalMoveChoice = {
  pieceId: string;
  move: LegalMove;
};

export function getAllLegalMovesForSide(gameState: GameState, side: PlayerSide): LegalMoveChoice[] {
  if (gameState.turn !== side || gameState.winner) {
    return [];
  }

  return Object.values(gameState.pieces)
    .filter((piece) => piece.side === side && getPiecePosition(gameState.board, piece.id))
    .flatMap((piece) => getLegalMovesForPiece(gameState, piece.id).map((move) => ({ pieceId: piece.id, move })));
}

export function chooseRandomMove(
  gameState: GameState,
  side: PlayerSide,
  random: () => number = Math.random,
): LegalMoveChoice | undefined {
  const legalMoves = getAllLegalMovesForSide(gameState, side);
  if (legalMoves.length === 0) {
    return undefined;
  }

  return legalMoves[Math.floor(random() * legalMoves.length)];
}
