import { getPiecePosition, getSquare, isFrontierLine, isFrontierZone } from "../board";
import { getCombatProfileForPiece } from "../data/classProfiles";
import { classifyMove } from "../movement";
import { GameState, LegalMove, Piece, PieceType, PlayerSide, Position } from "../types";
import { MoveScore, MoveScoreReason } from "./simulationTypes";

export const DEFAULT_HEURISTIC_WEIGHTS = {
  kingCaptureBonus: 10000,
  ownKingDangerPenalty: -8000,
  pawnPromotionBonus: 3,
  guardPromotionBonus: 2,
  frontierLineBonus: 1,
  frontierZoneBonus: 0.5,
  centreBonus: 1,
  adjacentCentreBonus: 0.5,
  adjacentFriendlyBonus: 0.5,
  lowWinProbabilityPenalty: -2,
  badTradePenalty: -2,
  cannonOpportunityBonus: 0.5,
};

export const PIECE_VALUES: Record<PieceType | "FrontierGuard" | "FrontierPawn", number> = {
  King: 1000,
  Rook: 6,
  Knight: 5,
  Bishop: 4,
  Cannon: 5,
  Guard: 4,
  Pawn: 2,
  FrontierGuard: 6,
  FrontierPawn: 4,
};

export function getCombatWinProbability(attackerProfile: readonly number[], defenderProfile: readonly number[]): number {
  let attackerWins = 0;

  attackerProfile.forEach((attackerRoll) => {
    defenderProfile.forEach((defenderRoll) => {
      if (attackerRoll >= defenderRoll) {
        attackerWins += 1;
      }
    });
  });

  return attackerWins / (attackerProfile.length * defenderProfile.length);
}

export function getPieceValue(piece: Piece): number {
  if (piece.type === "Pawn" && piece.promoted) {
    return PIECE_VALUES.FrontierPawn;
  }

  if (piece.type === "Guard" && piece.promoted) {
    return PIECE_VALUES.FrontierGuard;
  }

  return PIECE_VALUES[piece.type];
}

export function scoreMove(gameState: GameState, pieceId: string, move: LegalMove, side: PlayerSide): MoveScore {
  const reasons: MoveScoreReason[] = [];
  const piece = gameState.pieces[pieceId];
  const classification = move.classification ?? classifyMove(gameState, pieceId, move.to);

  if (!piece || piece.side !== side || !classification.legal) {
    return { total: Number.NEGATIVE_INFINITY, reasons: [{ label: "Illegal move", value: Number.NEGATIVE_INFINITY }] };
  }

  const attackerValue = getPieceValue(piece);
  const target = classification.targetPiece;

  if (classification.kind === "directCapture" && target) {
    add(reasons, "Direct capture target value", getPieceValue(target));
    if (target.type === "King") {
      add(reasons, "Captures King", DEFAULT_HEURISTIC_WEIGHTS.kingCaptureBonus);
    }
    if (piece.type === "Cannon" && classification.startsInHomeTerritory) {
      add(reasons, "Cannon home direct capture", 1);
      add(reasons, "No combat risk", 1);
    }
  }

  if (classification.kind === "combatCapture" && target) {
    const winProbability = getCombatWinProbability(getCombatProfileForPiece(piece), getCombatProfileForPiece(target));
    const loseProbability = 1 - winProbability;
    const expected = winProbability * getPieceValue(target) - loseProbability * attackerValue;
    add(reasons, `Combat EV (${Math.round(winProbability * 100)}% win)`, expected);
    if (target.type === "King") {
      add(reasons, "Potential King capture", DEFAULT_HEURISTIC_WEIGHTS.kingCaptureBonus * winProbability);
    }
    if (winProbability < 0.35) {
      add(reasons, "Low combat win probability", DEFAULT_HEURISTIC_WEIGHTS.lowWinProbabilityPenalty);
    }
    if (attackerValue > getPieceValue(target) && winProbability < 0.45) {
      add(reasons, "Bad trade risk", DEFAULT_HEURISTIC_WEIGHTS.badTradePenalty);
    }
  }

  if (classification.promotesPiece) {
    add(
      reasons,
      `${piece.type} promotion`,
      piece.type === "Pawn" ? DEFAULT_HEURISTIC_WEIGHTS.pawnPromotionBonus : DEFAULT_HEURISTIC_WEIGHTS.guardPromotionBonus,
    );
  }

  if ((piece.type === "Pawn" || piece.type === "Guard") && !piece.promoted) {
    const from = getPiecePosition(gameState.board, piece.id);
    if (from) {
      const rowProgress = piece.side === "Blue" ? move.to.row - from.row : from.row - move.to.row;
      if (rowProgress > 0) {
        add(reasons, "Moves toward promotion", rowProgress * 0.5);
      }
    }
  }

  if (isFrontierLine(move.to)) {
    add(reasons, "Frontier Line control", DEFAULT_HEURISTIC_WEIGHTS.frontierLineBonus);
  } else if (isFrontierZone(move.to)) {
    add(reasons, "Frontier Zone control", DEFAULT_HEURISTIC_WEIGHTS.frontierZoneBonus);
  }

  const centreBonus = getCentreBonus(move.to);
  if (centreBonus) {
    add(reasons, "Centre control", centreBonus);
  }

  if (hasAdjacentFriendly(gameState, move.to, side, piece.id)) {
    add(reasons, "Adjacent friendly support", DEFAULT_HEURISTIC_WEIGHTS.adjacentFriendlyBonus);
  }

  if (createsSimpleCannonOpportunity(gameState, move.to, side)) {
    add(reasons, "Future Cannon line", DEFAULT_HEURISTIC_WEIGHTS.cannonOpportunityBonus);
  }

  const total = reasons.reduce((sum, reason) => sum + reason.value, 0);
  return { total, reasons };
}

function add(reasons: MoveScoreReason[], label: string, value: number): void {
  if (value !== 0) {
    reasons.push({ label, value });
  }
}

function getCentreBonus(to: Position): number {
  if (to.col === 3 && to.row === 4) {
    return DEFAULT_HEURISTIC_WEIGHTS.centreBonus;
  }

  if (Math.max(Math.abs(to.col - 3), Math.abs(to.row - 4)) === 1) {
    return DEFAULT_HEURISTIC_WEIGHTS.adjacentCentreBonus;
  }

  return 0;
}

function hasAdjacentFriendly(gameState: GameState, to: Position, side: PlayerSide, movingPieceId: string): boolean {
  for (let row = to.row - 1; row <= to.row + 1; row += 1) {
    for (let col = to.col - 1; col <= to.col + 1; col += 1) {
      if (row === to.row && col === to.col) {
        continue;
      }
      const pieceId = getSquare(gameState.board, { col, row })?.pieceId;
      const piece = pieceId ? gameState.pieces[pieceId] : undefined;
      if (piece && piece.id !== movingPieceId && piece.side === side) {
        return true;
      }
    }
  }

  return false;
}

function createsSimpleCannonOpportunity(gameState: GameState, to: Position, side: PlayerSide): boolean {
  return Object.values(gameState.pieces).some((piece) => {
    if (piece.side !== side || piece.type !== "Cannon") {
      return false;
    }

    const cannonPosition = getPiecePosition(gameState.board, piece.id);
    if (!cannonPosition || (cannonPosition.col !== to.col && cannonPosition.row !== to.row)) {
      return false;
    }

    return true;
  });
}
