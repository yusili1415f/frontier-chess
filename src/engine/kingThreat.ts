import { coordinateLabel, getPiecePosition, samePosition } from "./board";
import { getLegalMovesForPiece } from "./movement";
import { GameState, PieceType, PlayerSide, Position } from "./types";

export interface KingThreat {
  kingSide: PlayerSide;
  kingPieceId: string;
  kingSquare: Position;
  attackerPieceId: string;
  attackerType: PieceType;
  attackerSide: PlayerSide;
  attackerSquare: Position;
  attackKind: "directCapture" | "combatCapture";
  reason: string;
}

export function getKingThreats(gameState: GameState, kingSide: PlayerSide): KingThreat[] {
  const king = Object.values(gameState.pieces).find((piece) => piece.side === kingSide && piece.type === "King");
  const kingSquare = king ? getPiecePosition(gameState.board, king.id) : undefined;

  if (!king || !kingSquare) {
    return [];
  }

  const attackerSide = oppositeSide(kingSide);
  const threatState: GameState = {
    ...gameState,
    turn: attackerSide,
    selectedPieceId: undefined,
    winner: undefined,
  };

  return Object.values(gameState.pieces)
    .filter((piece) => piece.side === attackerSide)
    .flatMap((attacker) => {
      const attackerSquare = getPiecePosition(gameState.board, attacker.id);
      if (!attackerSquare) {
        return [];
      }

      const attackMove = getLegalMovesForPiece(threatState, attacker.id).find((move) =>
        move.kind === "capture" &&
        samePosition(move.to, kingSquare) &&
        (move.classification?.kind === "directCapture" || move.classification?.kind === "combatCapture")
      );

      if (!attackMove || !attackMove.classification) {
        return [];
      }

      const attackKind = attackMove.classification.kind === "combatCapture" ? "combatCapture" : "directCapture";
      const reason = attacker.type === "Cannon" && attackMove.classification.cannon
        ? `${attackKind === "combatCapture" ? "Combat" : "Direct"} Cannon threat with exactly ${attackMove.classification.cannon.screenCount} screen at ${attackMove.classification.cannon.screenSquares.map(coordinateLabel).join(", ")}.`
        : attackMove.classification.reason;

      return [{
        kingSide,
        kingPieceId: king.id,
        kingSquare,
        attackerPieceId: attacker.id,
        attackerType: attacker.type,
        attackerSide,
        attackerSquare,
        attackKind,
        reason,
      }];
    });
}

export function isKingInCheck(gameState: GameState, side: PlayerSide): boolean {
  return getKingThreats(gameState, side).length > 0;
}

export function getCheckedSides(gameState: GameState): PlayerSide[] {
  return (["Blue", "Red"] as const).filter((side) => isKingInCheck(gameState, side));
}

function oppositeSide(side: PlayerSide): PlayerSide {
  return side === "Blue" ? "Red" : "Blue";
}
