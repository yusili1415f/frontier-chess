import { CombatProfile, Piece, PieceType } from "../types";

export const PIECE_TYPES: PieceType[] = ["King", "Rook", "Knight", "Bishop", "Cannon", "Guard", "Pawn"];

export const PIECE_ABBREVIATIONS: Record<PieceType, string> = {
  King: "K",
  Rook: "R",
  Knight: "N",
  Bishop: "B",
  Cannon: "C",
  Guard: "G",
  Pawn: "P",
};

export function getPieceAbbreviation(piece: Piece): string {
  const promotedMarker = piece.promoted && (piece.type === "Pawn" || piece.type === "Guard") ? "★" : "";
  return `${PIECE_ABBREVIATIONS[piece.type]}${promotedMarker}`;
}

export const CLASS_COMBAT_PROFILES: Record<PieceType, CombatProfile> = {
  King: { type: "King", dice: [1, 2, 3, 4, 5, 6] },
  Rook: { type: "Rook", dice: [1, 3, 3, 4, 4, 6] },
  Knight: { type: "Knight", dice: [2, 3, 4, 4, 5, 6] },
  Bishop: { type: "Bishop", dice: [0, 1, 2, 3, 4, 5] },
  Cannon: { type: "Cannon", dice: [0, 1, 2, 4, 4, 6] },
  Guard: { type: "Guard", dice: [1, 3, 3, 4, 5, 6] },
  Pawn: { type: "Pawn", dice: [0, 2, 2, 3, 3, 4] },
};

export const FRONTIER_COMBAT_PROFILES = {
  FrontierPawn: { type: "Pawn", dice: [1, 2, 3, 4, 4, 5] },
  FrontierGuard: { type: "Guard", dice: [2, 3, 4, 5, 5, 6] },
} satisfies Record<string, CombatProfile>;

export function getCombatProfileForPiece(piece: Piece): readonly number[] {
  if (piece.type === "Pawn" && piece.promoted) {
    return FRONTIER_COMBAT_PROFILES.FrontierPawn.dice;
  }

  if (piece.type === "Guard" && piece.promoted) {
    return FRONTIER_COMBAT_PROFILES.FrontierGuard.dice;
  }

  return CLASS_COMBAT_PROFILES[piece.type].dice;
}

export function getCombatProfileNameForPiece(piece: Piece): string {
  if (piece.type === "Pawn" && piece.promoted) {
    return "Frontier Pawn";
  }

  if (piece.type === "Guard" && piece.promoted) {
    return "Frontier Guard";
  }

  return piece.type;
}

export function averageCombatValue(type: PieceType): number {
  const dice = CLASS_COMBAT_PROFILES[type].dice;
  return dice.reduce((sum, value) => sum + value, 0) / dice.length;
}

export function averageCombatValueForPiece(piece: Piece): number {
  const dice = getCombatProfileForPiece(piece);
  return dice.reduce((sum, value) => sum + value, 0) / dice.length;
}
