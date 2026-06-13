import { CombatResult, GameState, MoveClassificationKind, PieceType, PlayerSide, Position } from "../types";

export type SimulationWinner = PlayerSide | "Draw" | null;

export type SimulationEndReason = "kingCaptured" | "maxTurns" | "noLegalMoves";

export type SimulatedMove = {
  turn: number;
  side: PlayerSide;
  pieceId: string;
  pieceType: PieceType;
  from: Position;
  to: Position;
  moveKind: Exclude<MoveClassificationKind, "illegal">;
  targetPieceType?: PieceType;
  combatResult?: CombatResult;
  promotion?: boolean;
  summary: string;
};

export type SimulationResult = {
  winner: SimulationWinner;
  reason: SimulationEndReason;
  totalTurns: number;
  moves: SimulatedMove[];
  finalState: GameState;
};

export type SimulationOptions = {
  maxTurns?: number;
  seed?: number;
  stopOnKingCapture?: boolean;
  randomness?: number;
  topN?: number;
};

export type MoveScoreReason = {
  label: string;
  value: number;
};

export type MoveScore = {
  total: number;
  reasons: MoveScoreReason[];
};

export type ScoredMoveChoice = {
  pieceId: string;
  move: import("../types").LegalMove;
  score: MoveScore;
};

export type BatchSimulationSummary = {
  games: number;
  blueWins: number;
  redWins: number;
  draws: number;
  averageTurns: number;
  shortestGame: number;
  longestGame: number;
  kingCaptures: number;
  combatCount: number;
  directCaptureCount: number;
  promotionCount: number;
  averageCombatCount: number;
  averageDirectCaptureCount: number;
  averagePromotionCount: number;
  averageKingCaptureTurn: number | null;
  results: SimulationResult[];
};
