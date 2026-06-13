import { MoveScore } from "./simulation/simulationTypes";
import { GameState, MoveRecord } from "./types";

export type MoveActor = "Human" | "AI";

export type AIMoveExplanation = {
  side: GameState["turn"];
  piece: MoveRecord["attacker"];
  from: MoveRecord["move"]["from"];
  to: MoveRecord["move"]["to"];
  target?: MoveRecord["defender"];
  score: MoveScore;
};

export type GameSnapshot = {
  state: GameState;
  aiExplanation?: AIMoveExplanation;
  playOutcome?: string;
};

export type GameHistoryEntry = {
  actor: MoveActor;
  before: GameSnapshot;
  after: GameSnapshot;
  record: MoveRecord;
};

export function createGameSnapshot(
  state: GameState,
  aiExplanation?: AIMoveExplanation,
  playOutcome?: string,
): GameSnapshot {
  return {
    state: cloneGameState(state),
    aiExplanation: aiExplanation ? cloneAIExplanation(aiExplanation) : undefined,
    playOutcome,
  };
}

export function annotateLastMove(state: GameState, actor: MoveActor): GameState {
  if (!state.lastMove) {
    return state;
  }

  const lastMove = { ...state.lastMove, actor };
  const moveHistory = state.moveHistory.map((record, index) => index === 0 ? lastMove : record);
  const log = state.log.map((entry, index) => index === 0 ? `${actor} ${entry}` : entry);

  return {
    ...state,
    lastMove,
    moveHistory,
    log,
  };
}

export function restoreSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return createGameSnapshot(snapshot.state, snapshot.aiExplanation, snapshot.playOutcome);
}

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((rank) => rank.map((square) => ({ ...square, position: { ...square.position } }))),
    pieces: Object.fromEntries(Object.entries(state.pieces).map(([id, piece]) => [id, { ...piece }])),
    log: [...state.log],
    moveHistory: state.moveHistory.map(cloneMoveRecord),
    lastMove: state.lastMove ? cloneMoveRecord(state.lastMove) : undefined,
    forcedDice: state.forcedDice ? { ...state.forcedDice } : undefined,
  };
}

function cloneMoveRecord(record: MoveRecord): MoveRecord {
  return {
    ...record,
    attacker: { ...record.attacker },
    defender: record.defender ? { ...record.defender } : undefined,
    move: {
      ...record.move,
      from: { ...record.move.from },
      to: { ...record.move.to },
      classification: record.move.classification
        ? {
            ...record.move.classification,
            from: record.move.classification.from ? { ...record.move.classification.from } : undefined,
            to: { ...record.move.classification.to },
            targetPiece: record.move.classification.targetPiece ? { ...record.move.classification.targetPiece } : undefined,
            cannon: record.move.classification.cannon
              ? {
                  ...record.move.classification.cannon,
                  screenSquares: record.move.classification.cannon.screenSquares.map((square) => ({ ...square })),
                }
              : undefined,
            cannonScreenSquares: record.move.classification.cannonScreenSquares?.map((square) => ({ ...square })),
          }
        : undefined,
    },
    combat: record.combat ? { ...record.combat, target: { ...record.combat.target } } : undefined,
    removedPiece: record.removedPiece ? { ...record.removedPiece } : undefined,
    cannon: record.cannon
      ? {
          ...record.cannon,
          screenSquares: record.cannon.screenSquares.map((square) => ({ ...square })),
        }
      : undefined,
    promotedPiece: record.promotedPiece ? { ...record.promotedPiece } : undefined,
  };
}

function cloneAIExplanation(explanation: AIMoveExplanation): AIMoveExplanation {
  return {
    ...explanation,
    piece: { ...explanation.piece },
    from: { ...explanation.from },
    to: { ...explanation.to },
    target: explanation.target ? { ...explanation.target } : undefined,
    score: {
      total: explanation.score.total,
      reasons: explanation.score.reasons.map((reason) => ({ ...reason })),
    },
  };
}
