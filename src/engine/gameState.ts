import { cloneBoard, coordinateLabel, getPiecePosition, getSquare, setPieceAt } from "./board";
import { shouldCannonCaptureUseCombat, shouldTriggerCombat, resolveCombat } from "./combat";
import { getCombatProfileNameForPiece } from "./data/classProfiles";
import { classifyMove, getLegalMove, getLegalMovesForPiece } from "./movement";
import { applyPromotionIfNeeded } from "./promotion";
import { createStartingPosition } from "./setup";
import { getCheckedSides } from "./kingThreat";
import { ForcedDice, GameState, LegalMove, MoveRecord, Piece, PlayerSide, Position } from "./types";

export function createInitialGameState(): GameState {
  const { board, pieces } = createStartingPosition();
  return {
    board,
    pieces,
    turn: "Blue",
    turnNumber: 1,
    log: ["Blue moves first."],
    moveHistory: [],
  };
}

export function selectPiece(state: GameState, pieceId?: string): GameState {
  if (!pieceId || state.winner) {
    return { ...state, selectedPieceId: undefined };
  }

  const piece = state.pieces[pieceId];
  if (!piece || piece.side !== state.turn) {
    return state;
  }

  return { ...state, selectedPieceId: pieceId };
}

export function getSelectedLegalMoves(state: GameState): LegalMove[] {
  return state.selectedPieceId ? getLegalMovesForPiece(state, state.selectedPieceId) : [];
}

export function moveSelectedPiece(state: GameState, to: Position): GameState {
  if (!state.selectedPieceId || state.winner) {
    return state;
  }

  const move = getLegalMove(state, state.selectedPieceId, to);
  if (!move) {
    return state;
  }

  return applyMove(state, state.selectedPieceId, move);
}

export function applyMove(state: GameState, pieceId: string, move: LegalMove): GameState {
  const attacker = state.pieces[pieceId];
  const defenderId = getSquare(state.board, move.to)?.pieceId;
  const defender = defenderId ? state.pieces[defenderId] : undefined;
  const classification = classifyMove(state, pieceId, move.to);

  if (!attacker || attacker.side !== state.turn || (defender && defender.side === attacker.side)) {
    return state;
  }

  if (defender) {
    const useCombat =
      attacker.type === "Cannon" ? shouldCannonCaptureUseCombat(state, attacker, move.to) : shouldTriggerCombat(move.to);

    return useCombat
      ? applyCombatMove(state, move, attacker, defender)
      : applyDirectCapture(state, move, attacker, defender);
  }

  const promotedAttacker = applyPromotionIfNeeded(attacker, move.to);
  const pieces = { ...state.pieces, [pieceId]: promotedAttacker };
  const boardAfterLeaving = setPieceAt(cloneBoard(state.board), move.from, undefined);
  const board = setPieceAt(boardAfterLeaving, move.to, pieceId);
  const record = {
    text: formatNormalMove(state.turnNumber, promotedAttacker, move, wasPromoted(attacker, promotedAttacker)),
    turnNumber: state.turnNumber,
    player: state.turn,
    attacker: promotedAttacker,
    move,
    promotedPiece: wasPromoted(attacker, promotedAttacker) ? promotedAttacker : undefined,
    promotionProfileName: wasPromoted(attacker, promotedAttacker) ? getCombatProfileNameForPiece(promotedAttacker) : undefined,
  };

  return finishMove(state, board, pieces, record);
}

export function pieceAt(state: GameState, position: Position): Piece | undefined {
  const pieceId = getSquare(state.board, position)?.pieceId;
  return pieceId ? state.pieces[pieceId] : undefined;
}

export function getSidePieces(state: GameState, side: PlayerSide): Piece[] {
  return Object.values(state.pieces).filter((piece) => piece.side === side);
}

export function findPieceByType(state: GameState, side: PlayerSide, type: Piece["type"]): Piece | undefined {
  return Object.values(state.pieces).find((piece) => piece.side === side && piece.type === type);
}

function applyDirectCapture(state: GameState, move: LegalMove, attacker: Piece, defender: Piece): GameState {
  const classification = classifyMove(state, attacker.id, move.to);
  const promotedAttacker = applyPromotionIfNeeded(attacker, move.to);
  const pieces = { ...state.pieces, [attacker.id]: promotedAttacker };
  delete pieces[defender.id];

  const boardAfterLeaving = setPieceAt(cloneBoard(state.board), move.from, undefined);
  const board = setPieceAt(boardAfterLeaving, move.to, attacker.id);
  const record = {
    text: formatDirectCapture(
      state.turnNumber,
      promotedAttacker,
      defender,
      move,
      classification.cannon,
      wasPromoted(attacker, promotedAttacker),
    ),
    turnNumber: state.turnNumber,
    player: state.turn,
    attacker: promotedAttacker,
    defender,
    move,
    capturedPieceId: defender.id,
    captureType: "Direct" as const,
    removedPiece: defender,
    cannon: classification.cannon,
    promotedPiece: wasPromoted(attacker, promotedAttacker) ? promotedAttacker : undefined,
    promotionProfileName: wasPromoted(attacker, promotedAttacker) ? getCombatProfileNameForPiece(promotedAttacker) : undefined,
  };

  return finishMove(state, board, pieces, record, defender.type === "King" ? attacker.side : undefined);
}

function applyCombatMove(state: GameState, move: LegalMove, attacker: Piece, defender: Piece): GameState {
  const classification = classifyMove(state, attacker.id, move.to);
  const combat = resolveCombat(attacker, defender, move.to, undefined, state.forcedDice);
  const pieces = { ...state.pieces };
  const boardAfterLeaving = setPieceAt(cloneBoard(state.board), move.from, undefined);
  let board = boardAfterLeaving;
  let winner: PlayerSide | undefined;
  let capturedPieceId: string;

  if (combat.attackerWon) {
    const promotedAttacker = applyPromotionIfNeeded(attacker, move.to);
    delete pieces[defender.id];
    pieces[attacker.id] = promotedAttacker;
    board = setPieceAt(boardAfterLeaving, move.to, attacker.id);
    capturedPieceId = defender.id;
    winner = defender.type === "King" ? attacker.side : undefined;
  } else {
    delete pieces[attacker.id];
    board = setPieceAt(boardAfterLeaving, move.to, defender.id);
    capturedPieceId = attacker.id;
    winner = attacker.type === "King" ? defender.side : undefined;
  }

  const removedPiece = combat.attackerWon ? defender : attacker;
  const recordAttacker = combat.attackerWon ? pieces[attacker.id] : attacker;
  const record: MoveRecord = {
    text: formatCombat(state.turnNumber, attacker, defender, move, combat),
    turnNumber: state.turnNumber,
    player: state.turn,
    attacker: recordAttacker,
    defender,
    move,
    capturedPieceId,
    combat,
    captureType: "Combat",
    removedPiece,
    cannon: classification.cannon,
    promotedPiece: combat.attackerWon && wasPromoted(attacker, recordAttacker) ? recordAttacker : undefined,
    promotionProfileName: combat.attackerWon && wasPromoted(attacker, recordAttacker)
      ? getCombatProfileNameForPiece(recordAttacker)
      : undefined,
  };

  return finishMove(state, board, pieces, record, winner);
}

function finishMove(
  state: GameState,
  board: GameState["board"],
  pieces: GameState["pieces"],
  record: MoveRecord,
  winner?: PlayerSide,
): GameState {
  const nextTurn = winner ? state.turn : oppositeSide(state.turn);
  const checkedSides = winner
    ? []
    : getCheckedSides({
        ...state,
        board,
        pieces,
        turn: nextTurn,
        selectedPieceId: undefined,
        winner,
      });
  const recordWithCheck: MoveRecord = {
    ...record,
    checkedSides: checkedSides.length ? checkedSides : undefined,
  };

  return {
    board,
    pieces,
    turn: nextTurn,
    turnNumber: winner ? state.turnNumber : state.turnNumber + 1,
    selectedPieceId: undefined,
    lastMove: recordWithCheck,
    moveHistory: [recordWithCheck, ...state.moveHistory],
    forcedDice: state.forcedDice,
    winner,
    log: [winner ? `${winner} wins by capturing the King.` : recordWithCheck.text, ...state.log],
  };
}

export function setForcedDice(state: GameState, forcedDice: ForcedDice): GameState {
  return {
    ...state,
    forcedDice: {
      attackerRollIndex: forcedDice.attackerRollIndex,
      defenderRollIndex: forcedDice.defenderRollIndex,
      attackerValue: forcedDice.attackerValue,
      defenderValue: forcedDice.defenderValue,
    },
  };
}

function oppositeSide(side: PlayerSide): PlayerSide {
  return side === "Blue" ? "Red" : "Blue";
}

function label(piece: Piece): string {
  return `${piece.side} ${piece.type}`;
}

function formatNormalMove(turnNumber: number, attacker: Piece, move: LegalMove, promoted: boolean): string {
  const promotionText = promoted ? ` ${label(attacker)} promoted to ${getCombatProfileNameForPiece(attacker)}.` : "";
  return `Turn ${turnNumber} - ${attacker.side} ${attacker.type} ${coordinateLabel(move.from)} -> ${coordinateLabel(move.to)}.${promotionText}`;
}

function formatDirectCapture(
  turnNumber: number,
  attacker: Piece,
  defender: Piece,
  move: LegalMove,
  cannon?: MoveRecord["cannon"],
  promoted = false,
): string {
  const cannonText =
    attacker.type === "Cannon" && cannon
      ? cannon.startsInHomeTerritory
        ? ` directly from home territory. Screen: ${cannon.screenSquares.map(coordinateLabel).join(", ")}.`
        : `. Screen: ${cannon.screenSquares.map(coordinateLabel).join(", ")}.`
      : ".";
  const promotionText = promoted ? ` ${label(attacker)} promoted to ${getCombatProfileNameForPiece(attacker)}.` : "";
  return `Turn ${turnNumber} - ${label(attacker)} ${coordinateLabel(move.from)} captures ${label(defender)} on ${coordinateLabel(move.to)}${cannonText}${promotionText}`;
}

function formatCombat(
  turnNumber: number,
  attacker: Piece,
  defender: Piece,
  move: LegalMove,
  combat: NonNullable<MoveRecord["combat"]>,
): string {
  const winner = combat.attackerWon ? label(attacker) : label(defender);
  const removed = combat.attackerWon ? label(defender) : label(attacker);
  const forced = combat.forcedDice ? " Forced dice debug mode." : "";
  return `Turn ${turnNumber} - ${label(attacker)} ${coordinateLabel(move.from)} attacks ${label(defender)} on ${coordinateLabel(move.to)}. Combat: ${getCombatProfileNameForPiece(attacker)} rolls ${combat.attackerValue}, ${getCombatProfileNameForPiece(defender)} rolls ${combat.defenderValue}. Attacker wins ties.${forced} ${winner} wins. ${removed} removed.`;
}

function wasPromoted(before: Piece, after: Piece): boolean {
  return !before.promoted && after.promoted === true;
}

export { getPiecePosition };
