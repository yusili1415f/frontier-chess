import { cloneBoard, coordinateLabel, getPiecePosition, getSquare, isInsideBoard, setPieceAt } from "./board";
import { shouldCannonCaptureUseCombat, shouldTriggerCombat, resolveCombat } from "./combat";
import { getCombatProfileNameForPiece } from "./data/classProfiles";
import { classifyMove, getLegalMove, getLegalMovesForPiece } from "./movement";
import { applyPromotionIfNeeded } from "./promotion";
import { createStartingPosition } from "./setup";
import { getCheckedSides } from "./kingThreat";
import { DEFAULT_SELECTED_FACTIONS } from "../data/factions/testFactions";
import { applyCardDrawTriggersAfterMove, completeActiveMoveCard, createDefaultCards, createDefaultDrawState, createDefaultTurnActions, getAdvanceMoves } from "./cards/cardEngine";
import { CombatModifier, ForcedDice, GameState, LegalMove, MoveRecord, Piece, PlayerSide, Position } from "./types";

export function createInitialGameState(): GameState {
  const { board, pieces } = createStartingPosition();
  const selectedFactions = { ...DEFAULT_SELECTED_FACTIONS };
  return {
    board,
    pieces,
    turn: "Blue",
    turnNumber: 1,
    selectedFactions,
    cards: createDefaultCards(selectedFactions),
    drawState: createDefaultDrawState(),
    turnActions: createDefaultTurnActions(),
    log: ["Blue moves first.", "Decks shuffled."],
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

export function applyAdvanceMove(state: GameState, pieceId: string, to: Position): GameState {
  const activeCard = state.activeMoveCard;
  const attacker = state.pieces[pieceId];
  const legal = getAdvanceMoves(state, pieceId).some((move) => move.col === to.col && move.row === to.row);
  if (!activeCard || !attacker || attacker.side !== activeCard.side || attacker.side !== state.turn || !legal) {
    return state;
  }

  const from = getPiecePosition(state.board, pieceId);
  if (!from) {
    return state;
  }

  const boardAfterLeaving = setPieceAt(cloneBoard(state.board), from, undefined);
  const board = setPieceAt(boardAfterLeaving, to, pieceId);
  const move: LegalMove = {
    from,
    to,
    kind: "move",
    classification: {
      legal: true,
      kind: "normalMove",
      from,
      to,
      reason: "Advance card move.",
    },
  };
  const record: MoveRecord = {
    text: `Turn ${state.turnNumber} - ${attacker.side} uses Advance: ${attacker.type} ${coordinateLabel(from)} -> ${coordinateLabel(to)}.`,
    turnNumber: state.turnNumber,
    player: state.turn,
    attacker,
    move,
  };

  return completeActiveMoveCard(finishMove(state, board, state.pieces, record));
}

export function getBannerDrillMoves(state: GameState, pieceId: string): Position[] {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  if (!activeCard || activeCard.cardName !== "Banner Drill" || !piece || piece.side !== activeCard.side) {
    return [];
  }
  if ((activeCard.phase === "selectPiece" || activeCard.phase === "moveGuard") && piece.type === "Guard") {
    return emptyAdjacentSquares(state, piece, true);
  }
  if (activeCard.phase === "moveCannon" && piece.type === "Cannon" && isAdjacentToPiece(state, piece, activeCard.selectedGuardId)) {
    return emptyOrthogonalSquares(state, piece);
  }
  return [];
}

export function getIronCrownActiveMoves(state: GameState, pieceId: string): LegalMove[] {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  if (
    !activeCard ||
    (activeCard.cardName !== "Breakthrough Charge" && activeCard.cardName !== "Crownbreaker Charge") ||
    !piece ||
    piece.side !== activeCard.side ||
    piece.type !== "Knight"
  ) {
    return [];
  }
  return getLegalMovesForPiece(state, pieceId);
}

export function applyIronCrownActiveMove(state: GameState, pieceId: string, move: LegalMove): GameState {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  if (
    !activeCard ||
    (activeCard.cardName !== "Breakthrough Charge" && activeCard.cardName !== "Crownbreaker Charge") ||
    !piece ||
    piece.side !== activeCard.side ||
    piece.type !== "Knight" ||
    piece.side !== state.turn
  ) {
    return state;
  }
  const after = applyMove(state, pieceId, move);
  return after === state ? state : completeActiveMoveCard(after);
}

export function applyBannerDrillMove(state: GameState, pieceId: string, to: Position): GameState {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  const legal = getBannerDrillMoves(state, pieceId).some((move) => move.col === to.col && move.row === to.row);
  if (!activeCard || activeCard.cardName !== "Banner Drill" || !piece || piece.side !== activeCard.side || piece.side !== state.turn || !legal) {
    return state;
  }
  const from = getPiecePosition(state.board, pieceId);
  if (!from) {
    return state;
  }
  const board = setPieceAt(setPieceAt(cloneBoard(state.board), from, undefined), to, pieceId);

  if (piece.type === "Guard") {
    const guardMovedState: GameState = {
      ...state,
      board,
      activeMoveCard: {
        ...activeCard,
        phase: "moveCannon",
        selectedGuardId: pieceId,
      },
      selectedPieceId: undefined,
      log: [`${piece.side} Guard moves ${coordinateLabel(from)} -> ${coordinateLabel(to)}.`, ...state.log],
    };
    return hasAdjacentFriendlyCannon(guardMovedState, pieceId)
      ? guardMovedState
      : completeActiveMoveCard(finishCardMovement(guardMovedState, `${piece.side} Banner Drill ends: no adjacent friendly Cannon.`));
  }

  if (piece.type === "Cannon") {
    return completeActiveMoveCard(finishCardMovement({
      ...state,
      board,
      selectedPieceId: undefined,
      log: [`${piece.side} Cannon moves ${coordinateLabel(from)} -> ${coordinateLabel(to)}.`, ...state.log],
    }, `${piece.side} Banner Drill complete.`));
  }
  return state;
}

export function skipBannerDrillCannonMove(state: GameState, side: PlayerSide): GameState {
  if (state.activeMoveCard?.cardName !== "Banner Drill" || state.activeMoveCard.side !== side || state.activeMoveCard.phase !== "moveCannon") {
    return state;
  }
  return completeActiveMoveCard(finishCardMovement(state, `${side} skips Cannon movement.`));
}

export function getCrownbreakerPostCombatMoves(state: GameState, pieceId: string): Position[] {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  if (!activeCard || activeCard.cardName !== "Crownbreaker Charge" || activeCard.phase !== "postCombatMove" || !piece || piece.side !== activeCard.side) {
    return [];
  }
  return emptyAdjacentSquares(state, piece, true);
}

export function applyCrownbreakerPostCombatMove(state: GameState, pieceId: string, to: Position): GameState {
  const activeCard = state.activeMoveCard;
  const piece = state.pieces[pieceId];
  const legal = getCrownbreakerPostCombatMoves(state, pieceId).some((move) => samePosition(move, to));
  if (!activeCard || activeCard.cardName !== "Crownbreaker Charge" || !piece || piece.side !== activeCard.side || !legal) {
    return state;
  }
  const from = getPiecePosition(state.board, pieceId);
  if (!from) {
    return state;
  }
  const board = setPieceAt(setPieceAt(cloneBoard(state.board), from, undefined), to, pieceId);
  return completeActiveMoveCard({
    ...state,
    board,
    turn: oppositeSide(piece.side),
    activeMoveCard: {
      ...activeCard,
      phase: "postCombatMove",
    },
    selectedPieceId: undefined,
    log: [`${piece.side} Knight moves 1 space after combat.`, ...state.log],
  });
}

export function skipCrownbreakerPostCombatMove(state: GameState, side: PlayerSide): GameState {
  if (state.activeMoveCard?.cardName !== "Crownbreaker Charge" || state.activeMoveCard.side !== side || state.activeMoveCard.phase !== "postCombatMove") {
    return state;
  }
  return completeActiveMoveCard(finishCardMovement({
    ...state,
    turn: oppositeSide(side),
    selectedPieceId: undefined,
  }, `${side} skips Crownbreaker post-combat move.`));
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
  const combat = resolveCombat(state, attacker, defender, move.to, undefined, state.forcedDice);
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

  const nextState = {
    ...state,
    board,
    pieces,
    turn: nextTurn,
    turnNumber: winner ? state.turnNumber : state.turnNumber + 1,
    turnActions: winner
      ? state.turnActions
      : {
          ...state.turnActions,
          [nextTurn]: {
            voluntaryDiscardUsedThisTurn: false,
          },
        },
    selectedPieceId: undefined,
    lastMove: recordWithCheck,
    moveHistory: [recordWithCheck, ...state.moveHistory],
    forcedDice: state.forcedDice,
    winner,
    log: [winner ? `${winner} wins by capturing the King.` : recordWithCheck.text, ...state.log],
  };
  return applyCardDrawTriggersAfterMove(nextState, recordWithCheck);
}

export function setForcedDice(state: GameState, forcedDice: ForcedDice): GameState {
  return {
    ...state,
    forcedDice: {
      attackerRollIndex: forcedDice.attackerRollIndex,
      defenderRollIndex: forcedDice.defenderRollIndex,
      attackerValue: forcedDice.attackerValue,
      defenderValue: forcedDice.defenderValue,
      attackerModifiers: forcedDice.attackerModifiers,
      defenderModifiers: forcedDice.defenderModifiers,
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
  const attackerModifiers = formatCombatModifiers(combat.attackerModifiers);
  const defenderModifiers = formatCombatModifiers(combat.defenderModifiers);
  return `Turn ${turnNumber} - ${label(attacker)} ${coordinateLabel(move.from)} attacks ${label(defender)} on ${coordinateLabel(move.to)}. Combat: ${getCombatProfileNameForPiece(attacker)} rolls ${combat.attackerRollIndex + 1} -> profile value ${combat.attackerBaseValue}.${attackerModifiers} Final ${combat.attackerFinalValue}. ${getCombatProfileNameForPiece(defender)} rolls ${combat.defenderRollIndex + 1} -> profile value ${combat.defenderBaseValue}.${defenderModifiers} Final ${combat.defenderFinalValue}. Attacker wins ties.${forced} ${winner} wins. ${removed} removed.`;
}

function formatCombatModifiers(modifiers: CombatModifier[]): string {
  if (!modifiers.length) {
    return "";
  }
  return ` ${modifiers.map((modifier) => `${modifier.source} ${modifier.value >= 0 ? "+" : ""}${modifier.value}`).join(". ")}.`;
}

function wasPromoted(before: Piece, after: Piece): boolean {
  return !before.promoted && after.promoted === true;
}

function finishCardMovement(state: GameState, message: string): GameState {
  return {
    ...state,
    log: [message, ...state.log],
  };
}

function emptyAdjacentSquares(state: GameState, piece: Piece, includeDiagonals: boolean): Position[] {
  const from = getPiecePosition(state.board, piece.id);
  if (!from) {
    return [];
  }
  const moves: Position[] = [];
  for (let dc = -1; dc <= 1; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (dc === 0 && dr === 0) {
        continue;
      }
      if (!includeDiagonals && Math.abs(dc) + Math.abs(dr) !== 1) {
        continue;
      }
      const to = { col: from.col + dc, row: from.row + dr };
      if (isInsideBoard(to) && !getSquare(state.board, to)?.pieceId) {
        moves.push(to);
      }
    }
  }
  return moves;
}

function emptyOrthogonalSquares(state: GameState, piece: Piece): Position[] {
  return emptyAdjacentSquares(state, piece, false);
}

function isAdjacentToPiece(state: GameState, piece: Piece, targetPieceId?: string): boolean {
  if (!targetPieceId) {
    return false;
  }
  const from = getPiecePosition(state.board, piece.id);
  const target = getPiecePosition(state.board, targetPieceId);
  return Boolean(from && target && Math.abs(from.col - target.col) <= 1 && Math.abs(from.row - target.row) <= 1);
}

function hasAdjacentFriendlyCannon(state: GameState, guardId: string): boolean {
  const guard = state.pieces[guardId];
  if (!guard) {
    return false;
  }
  return Object.values(state.pieces).some((piece) =>
    piece.side === guard.side &&
    piece.type === "Cannon" &&
    isAdjacentToPiece(state, piece, guardId) &&
    emptyOrthogonalSquares(state, piece).length > 0
  );
}

function samePosition(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

export { getPiecePosition };
