import { coordinateLabel } from "./board";
import { MoveRecord, PieceType, PlayerSide, Position } from "./types";

export type LastMoveHighlightKind =
  | "normalMove"
  | "directCapture"
  | "combatAttackerWon"
  | "combatDefenderWon"
  | "promotion"
  | "rematch"
  | "none";

export interface LastMoveHighlight {
  from?: Position;
  to?: Position;
  movedPieceId?: string;
  movedPieceType?: PieceType;
  movedPieceSide?: PlayerSide;
  targetSquare?: Position;
  targetPieceId?: string;
  targetPieceType?: PieceType;
  targetPieceSide?: PlayerSide;
  finalPieceSquare?: Position;
  removedPieceSquare?: Position;
  cannonScreenSquares: Position[];
  kind: LastMoveHighlightKind;
  summary: string;
}

export function deriveLastMoveHighlight(record?: MoveRecord): LastMoveHighlight {
  if (!record) {
    return {
      kind: "none",
      cannonScreenSquares: [],
      summary: "No moves yet.",
    };
  }

  if (record.combat && record.defender) {
    const attackerWon = record.combat.attackerWon;
    const winner = attackerWon ? record.attacker : record.defender;
    return {
      from: record.move.from,
      to: record.move.to,
      movedPieceId: record.attacker.id,
      movedPieceType: record.attacker.type,
      movedPieceSide: record.attacker.side,
      targetSquare: record.move.to,
      targetPieceId: record.defender.id,
      targetPieceType: record.defender.type,
      targetPieceSide: record.defender.side,
      finalPieceSquare: record.move.to,
      removedPieceSquare: attackerWon ? record.move.to : record.move.from,
      cannonScreenSquares: record.cannon?.screenSquares ?? [],
      kind: attackerWon ? "combatAttackerWon" : "combatDefenderWon",
      summary: attackerWon
        ? `Last battle: ${record.attacker.side} ${record.attacker.type} attacked ${record.defender.side} ${record.defender.type} at ${coordinateLabel(record.move.to)} and won.`
        : `Last battle: ${record.attacker.side} ${record.attacker.type} attacked ${record.defender.side} ${record.defender.type} at ${coordinateLabel(record.move.to)} and lost. ${winner.side} ${winner.type} held the square.`,
    };
  }

  if (record.defender) {
    const screen = record.cannon?.screenSquares.length
      ? ` Screen: ${record.cannon.screenSquares.map(coordinateLabel).join(", ")}.`
      : "";
    return {
      from: record.move.from,
      to: record.move.to,
      movedPieceId: record.attacker.id,
      movedPieceType: record.attacker.type,
      movedPieceSide: record.attacker.side,
      targetSquare: record.move.to,
      targetPieceId: record.defender.id,
      targetPieceType: record.defender.type,
      targetPieceSide: record.defender.side,
      finalPieceSquare: record.move.to,
      removedPieceSquare: record.move.to,
      cannonScreenSquares: record.cannon?.screenSquares ?? [],
      kind: "directCapture",
      summary: `Last action: ${record.attacker.side} ${record.attacker.type} ${coordinateLabel(record.move.from)} → ${coordinateLabel(record.move.to)}, captured ${record.defender.side} ${record.defender.type} directly.${screen}`,
    };
  }

  const promoted = Boolean(record.promotedPiece);
  return {
    from: record.move.from,
    to: record.move.to,
    movedPieceId: record.attacker.id,
    movedPieceType: record.attacker.type,
    movedPieceSide: record.attacker.side,
    finalPieceSquare: record.move.to,
    cannonScreenSquares: [],
    kind: promoted ? "promotion" : "normalMove",
    summary: promoted
      ? `Last action: ${record.attacker.side} ${record.attacker.type} ${coordinateLabel(record.move.from)} → ${coordinateLabel(record.move.to)}. Promoted to ${record.promotionProfileName ?? "Frontier profile"}.`
      : `Last action: ${record.attacker.side} ${record.attacker.type} ${coordinateLabel(record.move.from)} → ${coordinateLabel(record.move.to)}.`,
  };
}

export function isSameHighlightSquare(a: Position | undefined, b: Position): boolean {
  return Boolean(a && a.col === b.col && a.row === b.row);
}

export function includesHighlightSquare(squares: Position[], position: Position): boolean {
  return squares.some((square) => square.col === position.col && square.row === position.row);
}
