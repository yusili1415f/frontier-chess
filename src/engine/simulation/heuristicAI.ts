import { applyMove, createInitialGameState } from "../gameState";
import { GameState, PlayerSide } from "../types";
import { getAllLegalMovesForSide, LegalMoveChoice } from "./randomAI";
import { scoreMove } from "./moveScoring";
import { BatchSimulationSummary, ScoredMoveChoice, SimulationOptions, SimulationResult } from "./simulationTypes";
import { runSimulationWithChooser, seededRandom } from "./simulator";

export type HeuristicOptions = SimulationOptions & {
  randomness?: number;
  topN?: number;
};

export function chooseHeuristicMove(
  gameState: GameState,
  side: PlayerSide,
  options: HeuristicOptions = {},
): ScoredMoveChoice | null {
  const random = options.seed === undefined ? Math.random : seededRandom(options.seed);
  const scored = scoreLegalMoves(gameState, side).sort((a, b) => b.score.total - a.score.total);

  if (scored.length === 0) {
    return null;
  }

  const randomness = options.randomness ?? 0.1;
  const topN = options.topN ?? 3;

  if (randomness > 0 && random() < randomness) {
    const topMoves = scored.slice(0, Math.max(1, topN));
    return topMoves[Math.floor(random() * topMoves.length)];
  }

  const bestScore = scored[0].score.total;
  const bestMoves = scored.filter((choice) => choice.score.total === bestScore);
  return bestMoves[Math.floor(random() * bestMoves.length)];
}

export function scoreLegalMoves(gameState: GameState, side: PlayerSide): ScoredMoveChoice[] {
  return getAllLegalMovesForSide(gameState, side).map((choice) => ({
    ...choice,
    score: scoreMove(gameState, choice.pieceId, choice.move, side),
  }));
}

export function stepHeuristicMove(gameState: GameState, options: HeuristicOptions = {}): GameState {
  const choice = chooseHeuristicMove(gameState, gameState.turn, options);
  return choice ? applyMove(gameState, choice.pieceId, choice.move) : gameState;
}

export function runHeuristicSimulation(
  initialState: GameState = createInitialGameState(),
  options: HeuristicOptions = {},
): SimulationResult {
  return runSimulationWithChooser(initialState, options, (state, random) => {
    const scored = scoreLegalMoves(state, state.turn).sort((a, b) => b.score.total - a.score.total);
    if (scored.length === 0) {
      return undefined;
    }
    const randomness = options.randomness ?? 0.1;
    const topN = options.topN ?? 3;
    if (randomness > 0 && random() < randomness) {
      const topMoves = scored.slice(0, Math.max(1, topN));
      return topMoves[Math.floor(random() * topMoves.length)];
    }
    const bestScore = scored[0].score.total;
    const bestMoves = scored.filter((choice) => choice.score.total === bestScore);
    return bestMoves[Math.floor(random() * bestMoves.length)];
  });
}

export function runBatchHeuristicSimulations(
  games: number,
  options: HeuristicOptions = {},
): BatchSimulationSummary {
  const results = Array.from({ length: games }, (_, index) =>
    runHeuristicSimulation(createInitialGameState(), {
      ...options,
      seed: options.seed === undefined ? undefined : options.seed + index,
    }),
  );
  const totalTurns = results.reduce((sum, result) => sum + result.totalTurns, 0);
  const kingCaptureTurns = results.filter((result) => result.reason === "kingCaptured").map((result) => result.totalTurns);

  return {
    games,
    blueWins: results.filter((result) => result.winner === "Blue").length,
    redWins: results.filter((result) => result.winner === "Red").length,
    draws: results.filter((result) => result.winner === "Draw" || result.winner === null).length,
    averageTurns: games ? totalTurns / games : 0,
    shortestGame: Math.min(...results.map((result) => result.totalTurns)),
    longestGame: Math.max(...results.map((result) => result.totalTurns)),
    kingCaptures: kingCaptureTurns.length,
    combatCount: results.reduce((sum, result) => sum + result.moves.filter((move) => move.moveKind === "combatCapture").length, 0),
    directCaptureCount: results.reduce((sum, result) => sum + result.moves.filter((move) => move.moveKind === "directCapture").length, 0),
    promotionCount: results.reduce((sum, result) => sum + result.moves.filter((move) => move.promotion).length, 0),
    averageCombatCount: average(results.map((result) => result.moves.filter((move) => move.moveKind === "combatCapture").length)),
    averageDirectCaptureCount: average(results.map((result) => result.moves.filter((move) => move.moveKind === "directCapture").length)),
    averagePromotionCount: average(results.map((result) => result.moves.filter((move) => move.promotion).length)),
    averageKingCaptureTurn: kingCaptureTurns.length ? average(kingCaptureTurns) : null,
    results,
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
