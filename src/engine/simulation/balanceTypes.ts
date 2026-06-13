import { PlayerSide, PieceType } from "../types";
import { SimulationEndReason, SimulationResult } from "./simulationTypes";

export type BalanceAIType = "random" | "heuristic";

export type BalancePieceProfile = PieceType | "FrontierPawn" | "FrontierGuard";

export type BalanceRunOptions = {
  games: number;
  maxTurns: number;
  blueAI: BalanceAIType;
  redAI: BalanceAIType;
  heuristicRandomness?: number;
  seed?: number;
};

export type PieceTypeStats = {
  pieceType: BalancePieceProfile;
  capturesMade: number;
  timesCaptured: number;
  combatsEntered: number;
  combatsWon: number;
  combatsLost: number;
  directCapturesMade: number;
  combatCapturesMade: number;
  cannonCapturesMade: number;
  promotions: number;
  capturedOnTurns: number[];
};

export type CannonStats = {
  capturesAttempted: number;
  capturesSuccessful: number;
  directCapturesFromHome: number;
  combatCapturesOutsideHome: number;
  blueCaptures: number;
  redCaptures: number;
  blueCannonCaptured: number;
  redCannonCaptured: number;
};

export type CombatStats = {
  totalCombats: number;
  attackerWins: number;
  defenderWins: number;
  attackerTieWins: number;
  attackerWinRate: number;
};

export type PromotionStats = {
  pawnPromotions: number;
  guardPromotions: number;
  bluePromotions: number;
  redPromotions: number;
  promotedPiecesInCombat: number;
  promotedPiecesCapturing: number;
  promotedPiecesCaptured: number;
};

export type FrontierStats = {
  capturesInFrontierZone: number;
  capturesOutsideFrontierZone: number;
  combatsByRow: Record<3 | 4 | 5, number>;
};

export type BalanceFlag = {
  label: string;
  severity: "info" | "warning";
};

export type BalanceSummary = {
  options: BalanceRunOptions;
  gamesRun: number;
  blueWins: number;
  redWins: number;
  draws: number;
  noLegalMoveGames: number;
  maxTurnGames: number;
  kingCaptures: number;
  blueWinRate: number;
  redWinRate: number;
  drawRate: number;
  averageTurns: number;
  shortestGameTurns: number;
  longestGameTurns: number;
  averageCombatsPerGame: number;
  averageDirectCapturesPerGame: number;
  averageCannonCapturesPerGame: number;
  averagePromotionsPerGame: number;
  totalCaptures: number;
  directCaptures: number;
  combatCaptures: number;
  cannonCaptures: number;
  kingCaptureTurns: number[];
  combatStats: CombatStats;
  promotionStats: PromotionStats;
  frontierStats: FrontierStats;
  cannonStats: CannonStats;
  pieceStats: PieceTypeStats[];
  endReasons: Record<SimulationEndReason, number>;
  balanceFlags: BalanceFlag[];
  sampleGame?: SimulationResult;
};

export type BalanceGameMetrics = Omit<
  BalanceSummary,
  | "options"
  | "gamesRun"
  | "blueWins"
  | "redWins"
  | "draws"
  | "blueWinRate"
  | "redWinRate"
  | "drawRate"
  | "averageTurns"
  | "shortestGameTurns"
  | "longestGameTurns"
  | "averageCombatsPerGame"
  | "averageDirectCapturesPerGame"
  | "averageCannonCapturesPerGame"
  | "averagePromotionsPerGame"
  | "endReasons"
  | "balanceFlags"
  | "sampleGame"
>;

export type BalanceOutcomeCounts = Record<PlayerSide | "Draw", number>;
