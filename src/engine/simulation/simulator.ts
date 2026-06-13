import { coordinateLabel } from "../board";
import { getPieceAbbreviation } from "../data/classProfiles";
import { applyMove, createInitialGameState } from "../gameState";
import { GameState, MoveRecord, PlayerSide } from "../types";
import { chooseRandomMove, getAllLegalMovesForSide, LegalMoveChoice } from "./randomAI";
import { BatchSimulationSummary, SimulatedMove, SimulationOptions, SimulationResult } from "./simulationTypes";

const DEFAULT_MAX_TURNS = 200;

type MoveChooser = (state: GameState, random: () => number) => LegalMoveChoice | undefined;

export function runRandomSimulation(
  initialState: GameState = createInitialGameState(),
  options: SimulationOptions = {},
): SimulationResult {
  return runSimulationWithChooser(initialState, options, (state, random) => chooseRandomMove(state, state.turn, random));
}

export function runSimulationWithChooser(
  initialState: GameState,
  options: SimulationOptions,
  chooseMove: MoveChooser,
): SimulationResult {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const random = options.seed === undefined ? Math.random : seededRandom(options.seed);
  let state: GameState = { ...initialState, selectedPieceId: undefined };
  const moves: SimulatedMove[] = [];

  while (!state.winner && moves.length < maxTurns) {
    const choice = chooseMove(state, random);
    if (!choice) {
      return {
        winner: null,
        reason: "noLegalMoves",
        totalTurns: moves.length,
        moves,
        finalState: state,
      };
    }

    const before = state;
    state = applyMove(state, choice.pieceId, choice.move);
    if (state === before || !state.lastMove) {
      return {
        winner: null,
        reason: "noLegalMoves",
        totalTurns: moves.length,
        moves,
        finalState: state,
      };
    }

    moves.push(toSimulatedMove(state.lastMove));
  }

  if (state.winner) {
    return {
      winner: state.winner,
      reason: "kingCaptured",
      totalTurns: moves.length,
      moves,
      finalState: state,
    };
  }

  return {
    winner: "Draw",
    reason: "maxTurns",
    totalTurns: moves.length,
    moves,
    finalState: state,
  };
}

export function runBatchRandomSimulations(
  games: number,
  options: SimulationOptions = {},
): BatchSimulationSummary {
  const results = Array.from({ length: games }, (_, index) =>
    runRandomSimulation(createInitialGameState(), {
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
    kingCaptures: results.filter((result) => result.reason === "kingCaptured").length,
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

export function stepRandomMove(gameState: GameState): GameState {
  const choice = chooseRandomMove(gameState, gameState.turn);
  return choice ? applyMove(gameState, choice.pieceId, choice.move) : gameState;
}

export function getSimulationLegalMoveCount(gameState: GameState, side: PlayerSide): number {
  return getAllLegalMovesForSide(gameState, side).length;
}

function toSimulatedMove(record: MoveRecord): SimulatedMove {
  const moveKind = record.combat ? "combatCapture" : record.defender ? "directCapture" : "normalMove";
  return {
    turn: record.turnNumber,
    side: record.player,
    pieceId: record.attacker.id,
    pieceType: record.attacker.type,
    from: record.move.from,
    to: record.move.to,
    moveKind,
    targetPieceType: record.defender?.type,
    combatResult: record.combat,
    promotion: Boolean(record.promotedPiece),
    summary: formatSimulatedMove(record),
  };
}

function formatSimulatedMove(record: MoveRecord): string {
  const from = coordinateLabel(record.move.from);
  const to = coordinateLabel(record.move.to);
  const piece = `${record.attacker.side} ${getPieceAbbreviation(record.attacker)}`;

  if (record.combat && record.defender) {
    const winner = record.combat.attackerWon ? record.attacker.side : record.defender.side;
    return `Turn ${record.turnNumber} · ${record.player} · Combat — ${record.attacker.type} ${from} attacks ${record.defender.type} ${to}. Rolls ${record.combat.attackerValue} vs ${record.combat.defenderValue}. ${winner} wins.`;
  }

  if (record.defender) {
    const screen = record.cannon?.screenSquares.length
      ? ` Screen: ${record.cannon.screenSquares.map(coordinateLabel).join(", ")}.`
      : "";
    return `Turn ${record.turnNumber} · ${record.player} · Direct Capture — ${record.attacker.type} ${from} captures ${record.defender.type} ${to}.${screen}`;
  }

  if (record.promotedPiece) {
    return `Turn ${record.turnNumber} · ${record.player} · Promotion — ${record.attacker.type} ${from} → ${to}. Promoted to ${getPieceAbbreviation(record.attacker)}.`;
  }

  return `Turn ${record.turnNumber} · ${record.player} · Move — ${piece} ${from} → ${to}.`;
}

export function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) {
    value += 2147483646;
  }

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
