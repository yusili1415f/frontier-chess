import { createInitialGameState } from "../gameState";
import { GameState } from "../types";
import { chooseRandomMove, LegalMoveChoice } from "./randomAI";
import { scoreLegalMoves } from "./heuristicAI";
import { collectBalanceMetrics, createBalanceFlags, createPieceStatsMap, rate } from "./balanceMetrics";
import { BalanceAIType, BalanceRunOptions, BalanceSummary } from "./balanceTypes";
import { runSimulationWithChooser, seededRandom } from "./simulator";

const DEFAULT_BALANCE_OPTIONS: BalanceRunOptions = {
  games: 100,
  maxTurns: 200,
  blueAI: "heuristic",
  redAI: "heuristic",
  heuristicRandomness: 0.1,
};

export function runBalanceSimulation(options: Partial<BalanceRunOptions> = {}): BalanceSummary {
  const runOptions = normalizeOptions(options);
  const aggregate = createAggregate(runOptions);
  const turnCounts: number[] = [];
  let sampleGame: BalanceSummary["sampleGame"];

  for (let index = 0; index < runOptions.games; index += 1) {
    const result = runSimulationWithChooser(
      createInitialGameState(),
      {
        maxTurns: runOptions.maxTurns,
        seed: runOptions.seed === undefined ? undefined : runOptions.seed + index,
      },
      (state, random) => chooseMoveForSide(state, aiForSide(state.turn, runOptions), runOptions.heuristicRandomness ?? 0.1, random),
    );
    const metrics = collectBalanceMetrics(result);
    sampleGame = sampleGame ?? result;
    turnCounts.push(result.totalTurns);
    aggregate.blueWins += result.winner === "Blue" ? 1 : 0;
    aggregate.redWins += result.winner === "Red" ? 1 : 0;
    aggregate.draws += result.winner === "Draw" || result.winner === null ? 1 : 0;
    aggregate.noLegalMoveGames += metrics.noLegalMoveGames;
    aggregate.maxTurnGames += metrics.maxTurnGames;
    aggregate.kingCaptures += metrics.kingCaptures;
    aggregate.totalCaptures += metrics.totalCaptures;
    aggregate.directCaptures += metrics.directCaptures;
    aggregate.combatCaptures += metrics.combatCaptures;
    aggregate.cannonCaptures += metrics.cannonStats.capturesSuccessful;
    aggregate.kingCaptureTurns.push(...metrics.kingCaptureTurns);
    aggregate.endReasons[result.reason] += 1;

    aggregate.combatStats.totalCombats += metrics.combatStats.totalCombats;
    aggregate.combatStats.attackerWins += metrics.combatStats.attackerWins;
    aggregate.combatStats.defenderWins += metrics.combatStats.defenderWins;
    aggregate.combatStats.attackerTieWins += metrics.combatStats.attackerTieWins;

    aggregate.promotionStats.pawnPromotions += metrics.promotionStats.pawnPromotions;
    aggregate.promotionStats.guardPromotions += metrics.promotionStats.guardPromotions;
    aggregate.promotionStats.bluePromotions += metrics.promotionStats.bluePromotions;
    aggregate.promotionStats.redPromotions += metrics.promotionStats.redPromotions;
    aggregate.promotionStats.promotedPiecesInCombat += metrics.promotionStats.promotedPiecesInCombat;
    aggregate.promotionStats.promotedPiecesCapturing += metrics.promotionStats.promotedPiecesCapturing;
    aggregate.promotionStats.promotedPiecesCaptured += metrics.promotionStats.promotedPiecesCaptured;

    aggregate.frontierStats.capturesInFrontierZone += metrics.frontierStats.capturesInFrontierZone;
    aggregate.frontierStats.capturesOutsideFrontierZone += metrics.frontierStats.capturesOutsideFrontierZone;
    aggregate.frontierStats.combatsByRow[3] += metrics.frontierStats.combatsByRow[3];
    aggregate.frontierStats.combatsByRow[4] += metrics.frontierStats.combatsByRow[4];
    aggregate.frontierStats.combatsByRow[5] += metrics.frontierStats.combatsByRow[5];

    aggregate.cannonStats.capturesAttempted += metrics.cannonStats.capturesAttempted;
    aggregate.cannonStats.capturesSuccessful += metrics.cannonStats.capturesSuccessful;
    aggregate.cannonStats.directCapturesFromHome += metrics.cannonStats.directCapturesFromHome;
    aggregate.cannonStats.combatCapturesOutsideHome += metrics.cannonStats.combatCapturesOutsideHome;
    aggregate.cannonStats.blueCaptures += metrics.cannonStats.blueCaptures;
    aggregate.cannonStats.redCaptures += metrics.cannonStats.redCaptures;
    aggregate.cannonStats.blueCannonCaptured += metrics.cannonStats.blueCannonCaptured;
    aggregate.cannonStats.redCannonCaptured += metrics.cannonStats.redCannonCaptured;

    metrics.pieceStats.forEach((stats) => {
      const target = aggregate.pieceStats.find((pieceStats) => pieceStats.pieceType === stats.pieceType);
      if (!target) return;
      target.capturesMade += stats.capturesMade;
      target.timesCaptured += stats.timesCaptured;
      target.combatsEntered += stats.combatsEntered;
      target.combatsWon += stats.combatsWon;
      target.combatsLost += stats.combatsLost;
      target.directCapturesMade += stats.directCapturesMade;
      target.combatCapturesMade += stats.combatCapturesMade;
      target.cannonCapturesMade += stats.cannonCapturesMade;
      target.promotions += stats.promotions;
      target.capturedOnTurns.push(...stats.capturedOnTurns);
    });
  }

  aggregate.combatStats.attackerWinRate = rate(aggregate.combatStats.attackerWins, aggregate.combatStats.totalCombats);
  aggregate.blueWinRate = rate(aggregate.blueWins, aggregate.gamesRun);
  aggregate.redWinRate = rate(aggregate.redWins, aggregate.gamesRun);
  aggregate.drawRate = rate(aggregate.draws, aggregate.gamesRun);
  aggregate.averageTurns = average(turnCounts);
  aggregate.shortestGameTurns = turnCounts.length ? Math.min(...turnCounts) : 0;
  aggregate.longestGameTurns = turnCounts.length ? Math.max(...turnCounts) : 0;
  aggregate.averageCombatsPerGame = aggregate.gamesRun ? aggregate.combatStats.totalCombats / aggregate.gamesRun : 0;
  aggregate.averageDirectCapturesPerGame = aggregate.gamesRun ? aggregate.directCaptures / aggregate.gamesRun : 0;
  aggregate.averageCannonCapturesPerGame = aggregate.gamesRun ? aggregate.cannonStats.capturesSuccessful / aggregate.gamesRun : 0;
  aggregate.averagePromotionsPerGame = aggregate.gamesRun
    ? (aggregate.promotionStats.pawnPromotions + aggregate.promotionStats.guardPromotions) / aggregate.gamesRun
    : 0;
  aggregate.balanceFlags = createBalanceFlags(aggregate);
  aggregate.sampleGame = sampleGame;

  return aggregate;
}

export function chooseMoveForSide(
  state: GameState,
  aiType: BalanceAIType,
  heuristicRandomness: number,
  random: () => number = Math.random,
): LegalMoveChoice | undefined {
  if (aiType === "random") {
    return chooseRandomMove(state, state.turn, random);
  }

  const scored = scoreLegalMoves(state, state.turn).sort((a, b) => b.score.total - a.score.total);
  if (scored.length === 0) {
    return undefined;
  }
  if (heuristicRandomness > 0 && random() < heuristicRandomness) {
    const topMoves = scored.slice(0, 3);
    return topMoves[Math.floor(random() * topMoves.length)];
  }
  const bestScore = scored[0].score.total;
  const bestMoves = scored.filter((choice) => choice.score.total === bestScore);
  return bestMoves[Math.floor(random() * bestMoves.length)];
}

export function createSeededBalanceRandom(seed?: number): () => number {
  return seed === undefined ? Math.random : seededRandom(seed);
}

function createAggregate(options: BalanceRunOptions): BalanceSummary {
  return {
    options,
    gamesRun: options.games,
    blueWins: 0,
    redWins: 0,
    draws: 0,
    noLegalMoveGames: 0,
    maxTurnGames: 0,
    kingCaptures: 0,
    blueWinRate: 0,
    redWinRate: 0,
    drawRate: 0,
    averageTurns: 0,
    shortestGameTurns: 0,
    longestGameTurns: 0,
    averageCombatsPerGame: 0,
    averageDirectCapturesPerGame: 0,
    averageCannonCapturesPerGame: 0,
    averagePromotionsPerGame: 0,
    totalCaptures: 0,
    directCaptures: 0,
    combatCaptures: 0,
    cannonCaptures: 0,
    kingCaptureTurns: [],
    combatStats: {
      totalCombats: 0,
      attackerWins: 0,
      defenderWins: 0,
      attackerTieWins: 0,
      attackerWinRate: 0,
    },
    promotionStats: {
      pawnPromotions: 0,
      guardPromotions: 0,
      bluePromotions: 0,
      redPromotions: 0,
      promotedPiecesInCombat: 0,
      promotedPiecesCapturing: 0,
      promotedPiecesCaptured: 0,
    },
    frontierStats: {
      capturesInFrontierZone: 0,
      capturesOutsideFrontierZone: 0,
      combatsByRow: { 3: 0, 4: 0, 5: 0 },
    },
    cannonStats: {
      capturesAttempted: 0,
      capturesSuccessful: 0,
      directCapturesFromHome: 0,
      combatCapturesOutsideHome: 0,
      blueCaptures: 0,
      redCaptures: 0,
      blueCannonCaptured: 0,
      redCannonCaptured: 0,
    },
    pieceStats: Object.values(createPieceStatsMap()),
    endReasons: {
      kingCaptured: 0,
      maxTurns: 0,
      noLegalMoves: 0,
    },
    balanceFlags: [],
  };
}

function normalizeOptions(options: Partial<BalanceRunOptions>): BalanceRunOptions {
  return {
    ...DEFAULT_BALANCE_OPTIONS,
    ...options,
    games: Math.max(0, Math.floor(options.games ?? DEFAULT_BALANCE_OPTIONS.games)),
    maxTurns: Math.max(0, Math.floor(options.maxTurns ?? DEFAULT_BALANCE_OPTIONS.maxTurns)),
    heuristicRandomness: Math.max(0, Math.min(1, options.heuristicRandomness ?? DEFAULT_BALANCE_OPTIONS.heuristicRandomness ?? 0.1)),
  };
}

function aiForSide(side: "Blue" | "Red", options: BalanceRunOptions): BalanceAIType {
  return side === "Blue" ? options.blueAI : options.redAI;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
