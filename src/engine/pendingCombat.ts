import { coordinateLabel, getPiecePosition, getSquare, isInsideBoard } from "./board";
import { applyModifiers } from "./combat";
import { getCombatProfileForPiece, getCombatProfileNameForPiece } from "./data/classProfiles";
import { GameState, LegalMove, PendingCombat, Piece, PlayerSide, Position } from "./types";
import { cardDefinitionId, hasCardInHand, moveCardFromHandToDiscard } from "./cards/cardEngine";

export const COMBAT_ROLL_TIMEOUT_MS = 15_000;
export const COMBAT_RESULT_REVEAL_MS = 2_000;
export const GAMBIT_RESPONSE_WINDOW_MS = 5_000;

export function createPendingCombat(
  state: GameState,
  move: LegalMove,
  attacker: Piece,
  defender: Piece,
  now = Date.now(),
): PendingCombat {
  return {
    combatId: `${state.turnNumber}-${attacker.id}-${defender.id}-${coordinateLabel(move.to)}-${now}`,
    attackerPieceId: attacker.id,
    defenderPieceId: defender.id,
    attackerSide: attacker.side,
    defenderSide: defender.side,
    attackerSquare: { ...move.from },
    defenderSquare: { ...move.to },
    targetSquare: { ...move.to },
    attackerProfileName: getCombatProfileNameForPiece(attacker),
    defenderProfileName: getCombatProfileNameForPiece(defender),
    attackerProfile: [...getCombatProfileForPiece(attacker)],
    defenderProfile: [...getCombatProfileForPiece(defender)],
    attackerModifiers: [],
    defenderModifiers: [],
    startedAt: now,
    rollDeadlineAt: now + COMBAT_ROLL_TIMEOUT_MS,
    status: "waitingForAttackerRoll",
  };
}

export function attachBreakthroughCharge(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  knightPieceId: string,
  cardInstanceId: string,
): PendingCombat {
  if (side !== pendingCombat.attackerSide || knightPieceId !== pendingCombat.attackerPieceId) {
    return pendingCombat;
  }
  return {
    ...pendingCombat,
    breakthroughState: {
      side,
      knightPieceId,
      cardInstanceId,
      rerollUsed: false,
      rerollDeclined: false,
    },
  };
}

export function attachCrownbreakerCharge(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  knightPieceId: string,
  cardInstanceId: string,
): PendingCombat {
  if (side !== pendingCombat.attackerSide || knightPieceId !== pendingCombat.attackerPieceId) {
    return pendingCombat;
  }
  const modifier = {
    source: "Crownbreaker Charge",
    side,
    pieceId: knightPieceId,
    value: 1,
    description: "+1 to attacking Knight combat result",
  };
  return recalculatePendingCombatValues({
    ...pendingCombat,
    attackerModifiers: [...(pendingCombat.attackerModifiers ?? []), modifier],
    attackerPlayedCardIds: [...(pendingCombat.attackerPlayedCardIds ?? []), "crownbreaker_charge"],
    crownbreakerState: {
      side,
      knightPieceId,
      cardInstanceId,
      combatModifierApplied: true,
      postCombatMoveAvailable: false,
      postCombatMoveUsed: false,
      captureCountThisTurn: 1,
    },
  });
}

export function rollPendingCombatSide(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  options: { dieIndex?: number; autoRolled?: boolean } = {},
  gameState?: GameState,
): PendingCombat {
  const dieIndex = clampDieIndex(options.dieIndex ?? rollDieIndex());
  const autoRolled = options.autoRolled === true;

  if (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) {
    const next = {
      ...pendingCombat,
      attackerDieIndex: dieIndex,
      attackerProfileValue: pendingCombat.attackerProfile[dieIndex],
      attackerFinalValue: applyModifiers(pendingCombat.attackerProfile[dieIndex], pendingCombat.attackerModifiers ?? []),
      attackerAutoRolled: autoRolled || undefined,
    };
    return withStatus(next, gameState);
  }

  if (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined) {
    const next = {
      ...pendingCombat,
      defenderDieIndex: dieIndex,
      defenderProfileValue: pendingCombat.defenderProfile[dieIndex],
      defenderFinalValue: applyModifiers(pendingCombat.defenderProfile[dieIndex], pendingCombat.defenderModifiers ?? []),
      defenderAutoRolled: autoRolled || undefined,
    };
    return withStatus(next, gameState);
  }

  return pendingCombat;
}

export function autoRollExpiredPendingCombat(pendingCombat: PendingCombat, now = Date.now(), gameState?: GameState): PendingCombat {
  if (pendingCombat.status === "breakthroughWindow") {
    return declineBreakthroughChargeReroll(pendingCombat, gameState);
  }

  if (pendingCombat.status === "gambitWindow" && now >= (pendingCombat.gambitWindowDeadlineAt ?? Number.POSITIVE_INFINITY)) {
    return revealPendingCombat({
      ...pendingCombat,
      attackerPassedGambit: pendingCombat.attackerPassedGambit || !pendingCombat.attackerUsedGambit,
      defenderPassedGambit: pendingCombat.defenderPassedGambit || !pendingCombat.defenderUsedGambit,
    }, gameState);
  }

  if (now < pendingCombat.rollDeadlineAt || pendingCombat.status === "revealingResult" || pendingCombat.status === "resolved") {
    return pendingCombat;
  }

  let next = pendingCombat;
  if (next.attackerDieIndex === undefined) {
    next = rollPendingCombatSide(next, next.attackerSide, { autoRolled: true });
  }
  if (next.defenderDieIndex === undefined) {
    next = rollPendingCombatSide(next, next.defenderSide, { autoRolled: true });
  }
  return next;
}

export function getPendingCombatWinner(pendingCombat: PendingCombat): PlayerSide | undefined {
  if (pendingCombat.attackerProfileValue === undefined || pendingCombat.defenderProfileValue === undefined) {
    return undefined;
  }

  return getPendingCombatFinalValue(pendingCombat, "attacker") >= getPendingCombatFinalValue(pendingCombat, "defender")
    ? pendingCombat.attackerSide
    : pendingCombat.defenderSide;
}

export function pendingCombatToForcedDice(pendingCombat: PendingCombat) {
  return {
    attackerRollIndex: pendingCombat.attackerDieIndex,
    defenderRollIndex: pendingCombat.defenderDieIndex,
    attackerOriginalRollIndex: pendingCombat.attackerOriginalDieIndex,
    defenderOriginalRollIndex: pendingCombat.defenderOriginalDieIndex,
    attackerValue: pendingCombat.attackerProfileValue,
    defenderValue: pendingCombat.defenderProfileValue,
    attackerOriginalValue: pendingCombat.attackerOriginalProfileValue,
    defenderOriginalValue: pendingCombat.defenderOriginalProfileValue,
    attackerAutoRolled: pendingCombat.attackerAutoRolled,
    defenderAutoRolled: pendingCombat.defenderAutoRolled,
    attackerUsedGambit: pendingCombat.attackerUsedGambit,
    defenderUsedGambit: pendingCombat.defenderUsedGambit,
    attackerModifiers: pendingCombat.attackerModifiers,
    defenderModifiers: pendingCombat.defenderModifiers,
    lastStrikeDieIndex: pendingCombat.lastStrikeState?.dieIndex,
    lastStrikeSuccess: pendingCombat.lastStrikeState?.success,
  };
}

export function canUseBreakthroughChargeReroll(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  const state = pendingCombat.breakthroughState;
  return pendingCombat.status === "breakthroughWindow" &&
    state?.side === side &&
    !state.rerollUsed &&
    !state.rerollDeclined &&
    side === pendingCombat.attackerSide &&
    pendingCombat.attackerDieIndex !== undefined;
}

export function useBreakthroughChargeReroll(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  gameState?: GameState,
  options: { dieIndex?: number } = {},
): PendingCombat {
  if (!canUseBreakthroughChargeReroll(pendingCombat, side)) {
    return pendingCombat;
  }
  const dieIndex = clampDieIndex(options.dieIndex ?? rollDieIndex());
  const next = recalculatePendingCombatValues({
    ...pendingCombat,
    attackerOriginalDieIndex: pendingCombat.attackerOriginalDieIndex ?? pendingCombat.attackerDieIndex,
    attackerOriginalProfileValue: pendingCombat.attackerOriginalProfileValue ?? pendingCombat.attackerProfileValue,
    attackerDieIndex: dieIndex,
    attackerProfileValue: pendingCombat.attackerProfile[dieIndex],
    breakthroughState: pendingCombat.breakthroughState
      ? {
          ...pendingCombat.breakthroughState,
          originalDieIndex: pendingCombat.breakthroughState.originalDieIndex ?? pendingCombat.attackerDieIndex,
          originalProfileValue: pendingCombat.breakthroughState.originalProfileValue ?? pendingCombat.attackerProfileValue,
          rerolledDieIndex: dieIndex,
          rerolledProfileValue: pendingCombat.attackerProfile[dieIndex],
          rerollUsed: true,
          rerollDeclined: false,
        }
      : pendingCombat.breakthroughState,
  });
  return continueAfterBreakthrough(next, gameState);
}

export function declineBreakthroughChargeReroll(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  const state = pendingCombat.breakthroughState;
  if (pendingCombat.status !== "breakthroughWindow" || !state || state.rerollUsed || state.rerollDeclined) {
    return pendingCombat;
  }
  return continueAfterBreakthrough({
    ...pendingCombat,
    breakthroughState: {
      ...state,
      rerollDeclined: true,
    },
  }, gameState);
}

export function canSideUseGambit(pendingCombat: PendingCombat, gameState: GameState, side: PlayerSide): boolean {
  if (pendingCombat.status !== "gambitWindow" || !hasCardInHand(gameState, side, "basic_gambit")) {
    return false;
  }
  if (side === pendingCombat.attackerSide) {
    return !pendingCombat.attackerUsedGambit && !pendingCombat.attackerPassedGambit;
  }
  if (side === pendingCombat.defenderSide) {
    return !pendingCombat.defenderUsedGambit && !pendingCombat.defenderPassedGambit;
  }
  return false;
}

export function playPendingCombatGambit(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  options: { dieIndex?: number } = {},
  gameState?: GameState,
): PendingCombat {
  if (pendingCombat.status !== "gambitWindow") {
    return pendingCombat;
  }
  const dieIndex = clampDieIndex(options.dieIndex ?? rollDieIndex());
  if (side === pendingCombat.attackerSide && !pendingCombat.attackerUsedGambit && !pendingCombat.attackerPassedGambit) {
    return withGambitResponse({
      ...pendingCombat,
      attackerOriginalDieIndex: pendingCombat.attackerOriginalDieIndex ?? pendingCombat.attackerDieIndex,
      attackerOriginalProfileValue: pendingCombat.attackerOriginalProfileValue ?? pendingCombat.attackerProfileValue,
      attackerDieIndex: dieIndex,
      attackerProfileValue: pendingCombat.attackerProfile[dieIndex],
      attackerFinalValue: applyModifiers(pendingCombat.attackerProfile[dieIndex], pendingCombat.attackerModifiers ?? []),
      attackerUsedGambit: true,
    }, gameState);
  }
  if (side === pendingCombat.defenderSide && !pendingCombat.defenderUsedGambit && !pendingCombat.defenderPassedGambit) {
    return withGambitResponse({
      ...pendingCombat,
      defenderOriginalDieIndex: pendingCombat.defenderOriginalDieIndex ?? pendingCombat.defenderDieIndex,
      defenderOriginalProfileValue: pendingCombat.defenderOriginalProfileValue ?? pendingCombat.defenderProfileValue,
      defenderDieIndex: dieIndex,
      defenderProfileValue: pendingCombat.defenderProfile[dieIndex],
      defenderFinalValue: applyModifiers(pendingCombat.defenderProfile[dieIndex], pendingCombat.defenderModifiers ?? []),
      defenderUsedGambit: true,
    }, gameState);
  }
  return pendingCombat;
}

export function passPendingCombatGambit(pendingCombat: PendingCombat, side: PlayerSide, gameState?: GameState): PendingCombat {
  if (pendingCombat.status !== "gambitWindow") {
    return pendingCombat;
  }
  if (side === pendingCombat.attackerSide) {
    return withGambitResponse({ ...pendingCombat, attackerPassedGambit: true }, gameState);
  }
  if (side === pendingCombat.defenderSide) {
    return withGambitResponse({ ...pendingCombat, defenderPassedGambit: true }, gameState);
  }
  return pendingCombat;
}

export function canUseSmokeBomb(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  return pendingCombat.status === "smokeBombEscape" &&
    pendingCombat.smokeBombState?.side === side &&
    Boolean(pendingCombat.smokeBombState.legalEscapeSquares.length);
}

export function chooseSmokeBombEscape(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  escapeSquare: Position,
): PendingCombat {
  if (!canUseSmokeBomb(pendingCombat, side) || !pendingCombat.smokeBombState) {
    return pendingCombat;
  }
  const legal = pendingCombat.smokeBombState.legalEscapeSquares.some((square) => samePosition(square, escapeSquare));
  if (!legal) {
    return pendingCombat;
  }
  return {
    ...pendingCombat,
    smokeBombState: {
      ...pendingCombat.smokeBombState,
      selectedEscapeSquare: { ...escapeSquare },
    },
    status: "resolved",
  };
}

export function passSmokeBomb(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (pendingCombat.status !== "smokeBombEscape" || !pendingCombat.smokeBombState) {
    return pendingCombat;
  }
  return maybeOpenLastStrikeWindow({
    ...pendingCombat,
    smokeBombState: {
      ...pendingCombat.smokeBombState,
      passed: true,
    },
  }, gameState);
}

export function canUseLastStrike(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  return pendingCombat.status === "lastStrikeWindow" &&
    pendingCombat.lastStrikeState?.side === side &&
    !pendingCombat.lastStrikeState.resolved &&
    !pendingCombat.lastStrikeState.passed;
}

export function playLastStrike(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  options: { dieIndex?: number } = {},
): PendingCombat {
  if (!canUseLastStrike(pendingCombat, side) || !pendingCombat.lastStrikeState) {
    return pendingCombat;
  }
  const dieIndex = clampDieIndex(options.dieIndex ?? rollDieIndex());
  return finalizeRevealPendingCombat({
    ...pendingCombat,
    lastStrikeState: {
      ...pendingCombat.lastStrikeState,
      dieIndex,
      success: dieIndex >= 3,
      resolved: true,
    },
  });
}

export function passLastStrike(pendingCombat: PendingCombat): PendingCombat {
  if (pendingCombat.status !== "lastStrikeWindow" || !pendingCombat.lastStrikeState) {
    return pendingCombat;
  }
  return finalizeRevealPendingCombat({
    ...pendingCombat,
    lastStrikeState: {
      ...pendingCombat.lastStrikeState,
      resolved: true,
      passed: true,
    },
  });
}

export function canPlayBeforeCombatCard(
  pendingCombat: PendingCombat,
  gameState: GameState,
  side: PlayerSide,
  cardId: string,
): boolean {
  if (pendingCombat.status !== "waitingForAttackerRoll" && pendingCombat.status !== "waitingForDefenderRoll" && pendingCombat.status !== "waitingForBothRolls") {
    return false;
  }
  const card = gameState.cards[side].hand.find((entry) => entry.id === cardId) ??
    gameState.cards[side].hand.find((entry) => cardDefinitionId(entry) === cardId);
  if (!card?.implemented || card.timing !== "beforeCombat") {
    return false;
  }
  const definitionId = cardDefinitionId(card);
  if (hasPlayedCardDefinition(pendingCombat, side, definitionId)) {
    return false;
  }
  const piece = combatPieceForSide(pendingCombat, gameState, side);
  if (!piece) {
    return false;
  }
  if (definitionId === "dragon_formation") {
    return gameState.selectedFactions[side] === "dragon_banner_army" && isAdjacentToFriendlyType(gameState, piece, "Guard");
  }
  if (definitionId === "guan_dao_champion") {
    return gameState.selectedFactions[side] === "dragon_banner_army" &&
      piece.type === "Guard" &&
      isAdjacentToFriendlyPiece(gameState, piece);
  }
  if (definitionId === "lance_formation") {
    return gameState.selectedFactions[side] === "iron_crown_cavalry" &&
      side === pendingCombat.attackerSide &&
      piece.id === pendingCombat.attackerPieceId &&
      piece.type === "Knight" &&
      !hasPlayedCardDefinition(pendingCombat, side, "lance_formation");
  }
  if (definitionId === "samurai_challenge") {
    const enemyPiece = side === pendingCombat.attackerSide
      ? combatPieceForSide(pendingCombat, gameState, pendingCombat.defenderSide)
      : combatPieceForSide(pendingCombat, gameState, pendingCombat.attackerSide);
    return gameState.selectedFactions[side] === "sakura_shogunate" &&
      Boolean(enemyPiece) &&
      !isAdjacentToFriendlyPiece(gameState, piece) &&
      !isAdjacentToFriendlyPiece(gameState, enemyPiece!);
  }
  if (definitionId === "bone_sacrifice") {
    return gameState.selectedFactions[side] === "bone_legion" &&
      side === pendingCombat.attackerSide &&
      piece.id === pendingCombat.attackerPieceId &&
      adjacentFriendlyPawns(gameState, piece).length > 0;
  }
  return false;
}

export function playBeforeCombatCard(
  pendingCombat: PendingCombat,
  gameState: GameState,
  side: PlayerSide,
  cardId: string,
): { pendingCombat: PendingCombat; gameState: GameState } {
  if (!canPlayBeforeCombatCard(pendingCombat, gameState, side, cardId)) {
    return { pendingCombat, gameState };
  }
  const card = gameState.cards[side].hand.find((entry) => entry.id === cardId) ??
    gameState.cards[side].hand.find((entry) => cardDefinitionId(entry) === cardId);
  if (!card) {
    return { pendingCombat, gameState };
  }
  const definitionId = cardDefinitionId(card);
  const piece = combatPieceForSide(pendingCombat, gameState, side);
  if (!piece) {
    return { pendingCombat, gameState };
  }
  if (definitionId === "bone_sacrifice") {
    return {
      pendingCombat: {
        ...pendingCombat,
        status: "boneSacrificeSelect",
        boneSacrificeState: {
          side,
          cardInstanceId: card.id,
          attackerPieceId: piece.id,
          legalPawnPieceIds: adjacentFriendlyPawns(gameState, piece).map((pawn) => pawn.id),
        },
      },
      gameState,
    };
  }
  const value = definitionId === "guan_dao_champion" ? 2 : 1;
  const source = definitionId === "guan_dao_champion"
    ? "Guan Dao Champion"
    : definitionId === "lance_formation" ? "Lance Formation" : definitionId === "samurai_challenge" ? "Samurai Challenge" : "Dragon Formation";
  const description = definitionId === "guan_dao_champion"
    ? "+2 to Guard combat result"
    : definitionId === "lance_formation"
      ? "+1 to attacking Knight combat result"
      : definitionId === "samurai_challenge"
        ? "+1 because both combat pieces are isolated"
        : `+1 because ${side} ${piece.type} is adjacent to a friendly Guard`;
  const modifier = {
    source,
    side,
    pieceId: piece.id,
    value,
    description,
  };
  const isAttacker = side === pendingCombat.attackerSide;
  const nextPending = recalculatePendingCombatValues({
    ...pendingCombat,
    attackerModifiers: isAttacker ? [...(pendingCombat.attackerModifiers ?? []), modifier] : pendingCombat.attackerModifiers,
    defenderModifiers: !isAttacker ? [...(pendingCombat.defenderModifiers ?? []), modifier] : pendingCombat.defenderModifiers,
    attackerPlayedCardIds: isAttacker
      ? [...(pendingCombat.attackerPlayedCardIds ?? []), definitionId]
      : pendingCombat.attackerPlayedCardIds,
    defenderPlayedCardIds: !isAttacker
      ? [...(pendingCombat.defenderPlayedCardIds ?? []), definitionId]
      : pendingCombat.defenderPlayedCardIds,
  });
  const nextState = moveCardFromHandToDiscard(gameState, side, card.id);
  return {
    pendingCombat: nextPending,
    gameState: {
      ...nextState,
      log: [`${side} plays ${source}: ${modifier.description}.`, ...nextState.log],
    },
  };
}

export function chooseBoneSacrificePawn(
  pendingCombat: PendingCombat,
  gameState: GameState,
  side: PlayerSide,
  pawnPieceId: string,
): { pendingCombat: PendingCombat; gameState: GameState } {
  const bone = pendingCombat.boneSacrificeState;
  if (pendingCombat.status !== "boneSacrificeSelect" || !bone || bone.side !== side || !bone.legalPawnPieceIds.includes(pawnPieceId)) {
    return { pendingCombat, gameState };
  }
  const pawn = gameState.pieces[pawnPieceId];
  const pawnSquare = pawn ? getPiecePosition(gameState.board, pawnPieceId) : undefined;
  if (!pawn || pawn.type !== "Pawn" || pawn.side !== side || !pawnSquare) {
    return { pendingCombat, gameState };
  }
  const modifier = {
    source: "Bone Sacrifice",
    side,
    pieceId: bone.attackerPieceId,
    value: 1,
    description: "+1 to attacker combat result",
  };
  const nextPending = recalculatePendingCombatValues({
    ...pendingCombat,
    status: "waitingForBothRolls",
    attackerModifiers: [...(pendingCombat.attackerModifiers ?? []), modifier],
    attackerPlayedCardIds: [...(pendingCombat.attackerPlayedCardIds ?? []), "bone_sacrifice"],
    boneSacrificeState: {
      ...bone,
      selectedPawnPieceId: pawnPieceId,
    },
  });
  const withoutCard = moveCardFromHandToDiscard(gameState, side, bone.cardInstanceId);
  const board = withoutCard.board.map((rank) => rank.map((square) =>
    square.pieceId === pawnPieceId ? { ...square, pieceId: undefined } : square
  ));
  const { [pawnPieceId]: _removed, ...pieces } = withoutCard.pieces;
  return {
    pendingCombat: nextPending,
    gameState: {
      ...withoutCard,
      board,
      pieces,
      removedPieces: {
        ...withoutCard.removedPieces,
        [side]: [
          ...withoutCard.removedPieces[side],
          {
            pieceId: pawn.id,
            side,
            type: pawn.type,
            wasPromoted: pawn.promoted || undefined,
            removedFrom: pawnSquare,
            removedReason: "sacrificed",
            removedTurn: withoutCard.turnNumber,
          },
        ],
      },
      log: [`${side} sacrifices Pawn at ${coordinateLabel(pawnSquare)}. Bone Sacrifice: +1 to attacker combat result.`, ...withoutCard.log],
    },
  };
}

export function cancelBoneSacrificeSelection(pendingCombat: PendingCombat): PendingCombat {
  if (pendingCombat.status !== "boneSacrificeSelect") {
    return pendingCombat;
  }
  return {
    ...pendingCombat,
    status: "waitingForBothRolls",
    boneSacrificeState: undefined,
  };
}

export function getPendingCombatFinalValue(pendingCombat: PendingCombat, role: "attacker" | "defender"): number {
  if (role === "attacker") {
    return pendingCombat.attackerFinalValue ??
      applyModifiers(pendingCombat.attackerProfileValue ?? 0, pendingCombat.attackerModifiers ?? []);
  }
  return pendingCombat.defenderFinalValue ??
    applyModifiers(pendingCombat.defenderProfileValue ?? 0, pendingCombat.defenderModifiers ?? []);
}

function recalculatePendingCombatValues(pendingCombat: PendingCombat): PendingCombat {
  const attackerFinalValue = pendingCombat.attackerProfileValue === undefined
    ? pendingCombat.attackerFinalValue
    : applyModifiers(pendingCombat.attackerProfileValue, pendingCombat.attackerModifiers ?? []);
  const defenderFinalValue = pendingCombat.defenderProfileValue === undefined
    ? pendingCombat.defenderFinalValue
    : applyModifiers(pendingCombat.defenderProfileValue, pendingCombat.defenderModifiers ?? []);
  return {
    ...pendingCombat,
    attackerFinalValue,
    defenderFinalValue,
  };
}

export function canSideRollPendingCombat(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  return (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) ||
    (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined);
}

function withStatus(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (pendingCombat.attackerDieIndex !== undefined && pendingCombat.defenderDieIndex !== undefined) {
    if (shouldOpenBreakthroughWindow(pendingCombat)) {
      return {
        ...pendingCombat,
        status: "breakthroughWindow",
      };
    }
    if (gameState && hasAnyGambitEligible(pendingCombat, gameState)) {
      const startedAt = Date.now();
      return {
        ...pendingCombat,
        status: "gambitWindow",
        gambitWindowStartedAt: startedAt,
        gambitWindowDeadlineAt: startedAt + GAMBIT_RESPONSE_WINDOW_MS,
        attackerPassedGambit: pendingCombat.attackerPassedGambit ||
          !hasCardInHand(gameState, pendingCombat.attackerSide, "basic_gambit"),
        defenderPassedGambit: pendingCombat.defenderPassedGambit ||
          !hasCardInHand(gameState, pendingCombat.defenderSide, "basic_gambit"),
      };
    }
    return revealPendingCombat(pendingCombat, gameState);
  }
  if (pendingCombat.attackerDieIndex === undefined && pendingCombat.defenderDieIndex === undefined) {
    return { ...pendingCombat, status: "waitingForBothRolls" };
  }
  if (pendingCombat.attackerDieIndex === undefined) {
    return { ...pendingCombat, status: "waitingForAttackerRoll" };
  }
  return { ...pendingCombat, status: "waitingForDefenderRoll" };
}

function revealPendingCombat(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  const revealed = finalizeRevealPendingCombat(pendingCombat);
  return maybeOpenSakuraReaction(revealed, gameState);
}

function finalizeRevealPendingCombat(pendingCombat: PendingCombat): PendingCombat {
  const attackerFinalValue = getPendingCombatFinalValue(pendingCombat, "attacker");
  const defenderFinalValue = getPendingCombatFinalValue(pendingCombat, "defender");
  const isTie = attackerFinalValue === defenderFinalValue;
  const attackerWins = attackerFinalValue >= defenderFinalValue;
  const resultRevealedAt = Date.now();
  return {
      ...pendingCombat,
      attackerFinalValue,
      defenderFinalValue,
      status: "revealingResult",
      resultRevealedAt,
      resolveAfterAt: resultRevealedAt + COMBAT_RESULT_REVEAL_MS,
      winnerSide: attackerWins ? pendingCombat.attackerSide : pendingCombat.defenderSide,
      attackerWins,
      isTie,
  };
}

function hasAnyGambitEligible(pendingCombat: PendingCombat, gameState: GameState): boolean {
  return hasCardInHand(gameState, pendingCombat.attackerSide, "basic_gambit") ||
    hasCardInHand(gameState, pendingCombat.defenderSide, "basic_gambit");
}

function withGambitResponse(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  const attackerDone = pendingCombat.attackerUsedGambit || pendingCombat.attackerPassedGambit;
  const defenderDone = pendingCombat.defenderUsedGambit || pendingCombat.defenderPassedGambit;
  return attackerDone && defenderDone ? revealPendingCombat(pendingCombat, gameState) : pendingCombat;
}

function continueAfterBreakthrough(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (gameState && hasAnyGambitEligible(pendingCombat, gameState)) {
    const startedAt = Date.now();
    return {
      ...pendingCombat,
      status: "gambitWindow",
      gambitWindowStartedAt: startedAt,
      gambitWindowDeadlineAt: startedAt + GAMBIT_RESPONSE_WINDOW_MS,
      attackerPassedGambit: pendingCombat.attackerPassedGambit ||
        !hasCardInHand(gameState, pendingCombat.attackerSide, "basic_gambit"),
      defenderPassedGambit: pendingCombat.defenderPassedGambit ||
        !hasCardInHand(gameState, pendingCombat.defenderSide, "basic_gambit"),
    };
  }
  return revealPendingCombat(pendingCombat, gameState);
}

function maybeOpenSakuraReaction(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (!gameState || !pendingCombat.attackerWins) {
    return pendingCombat;
  }
  const smoke = createSmokeBombState(pendingCombat, gameState);
  if (smoke) {
    return {
      ...pendingCombat,
      status: "smokeBombEscape",
      smokeBombState: smoke,
      resolveAfterAt: undefined,
    };
  }
  return maybeOpenLastStrikeWindow(pendingCombat, gameState);
}

function maybeOpenLastStrikeWindow(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (!gameState || !pendingCombat.attackerWins) {
    return pendingCombat.status === "smokeBombEscape" ? finalizeRevealPendingCombat(pendingCombat) : pendingCombat;
  }
  const lastStrike = createLastStrikeState(pendingCombat, gameState);
  if (lastStrike) {
    return {
      ...pendingCombat,
      status: "lastStrikeWindow",
      lastStrikeState: lastStrike,
      resolveAfterAt: undefined,
    };
  }
  return finalizeRevealPendingCombat({
    ...pendingCombat,
    smokeBombState: pendingCombat.smokeBombState,
  });
}

function createSmokeBombState(pendingCombat: PendingCombat, gameState: GameState): PendingCombat["smokeBombState"] | undefined {
  const defender = gameState.pieces[pendingCombat.defenderPieceId];
  if (
    !defender ||
    defender.type !== "Bishop" ||
    gameState.selectedFactions[defender.side] !== "sakura_shogunate" ||
    pendingCombat.smokeBombState?.passed ||
    pendingCombat.smokeBombState?.selectedEscapeSquare
  ) {
    return undefined;
  }
  const card = gameState.cards[defender.side].hand.find((entry) => cardDefinitionId(entry) === "smoke_bomb" && entry.implemented);
  if (!card) {
    return undefined;
  }
  const legalEscapeSquares = emptyAdjacentSquares(gameState, pendingCombat.defenderSquare);
  if (!legalEscapeSquares.length) {
    return undefined;
  }
  return {
    side: defender.side,
    bishopPieceId: defender.id,
    attackerPieceId: pendingCombat.attackerPieceId,
    bishopOriginalSquare: { ...pendingCombat.defenderSquare },
    legalEscapeSquares,
    cardInstanceId: card.id,
  };
}

function createLastStrikeState(pendingCombat: PendingCombat, gameState: GameState): PendingCombat["lastStrikeState"] | undefined {
  const defender = gameState.pieces[pendingCombat.defenderPieceId];
  if (
    !defender ||
    (defender.type !== "Bishop" && defender.type !== "Guard") ||
    gameState.selectedFactions[defender.side] !== "sakura_shogunate" ||
    pendingCombat.lastStrikeState?.resolved ||
    pendingCombat.smokeBombState?.selectedEscapeSquare
  ) {
    return undefined;
  }
  const card = gameState.cards[defender.side].hand.find((entry) => cardDefinitionId(entry) === "last_strike" && entry.implemented);
  if (!card) {
    return undefined;
  }
  return {
    side: defender.side,
    capturedPieceId: defender.id,
    capturedPieceType: defender.type,
    attackingPieceId: pendingCombat.attackerPieceId,
    cardInstanceId: card.id,
    resolved: false,
  };
}

function shouldOpenBreakthroughWindow(pendingCombat: PendingCombat): boolean {
  const state = pendingCombat.breakthroughState;
  return Boolean(
    state &&
    state.side === pendingCombat.attackerSide &&
    state.knightPieceId === pendingCombat.attackerPieceId &&
    !state.rerollUsed &&
    !state.rerollDeclined,
  );
}

function hasPlayedCardDefinition(pendingCombat: PendingCombat, side: PlayerSide, definitionId: string): boolean {
  if (side === pendingCombat.attackerSide) {
    return (pendingCombat.attackerPlayedCardIds ?? []).includes(definitionId);
  }
  if (side === pendingCombat.defenderSide) {
    return (pendingCombat.defenderPlayedCardIds ?? []).includes(definitionId);
  }
  return true;
}

function combatPieceForSide(pendingCombat: PendingCombat, gameState: GameState, side: PlayerSide): Piece | undefined {
  const pieceId = side === pendingCombat.attackerSide
    ? pendingCombat.attackerPieceId
    : side === pendingCombat.defenderSide ? pendingCombat.defenderPieceId : undefined;
  return pieceId ? gameState.pieces[pieceId] : undefined;
}

function isAdjacentToFriendlyType(gameState: GameState, piece: Piece, type: Piece["type"]): boolean {
  return adjacentFriendlyPieces(gameState, piece).some((friendly) => friendly.type === type);
}

function isAdjacentToFriendlyPiece(gameState: GameState, piece: Piece): boolean {
  return adjacentFriendlyPieces(gameState, piece).length > 0;
}

function adjacentFriendlyPawns(gameState: GameState, piece: Piece): Piece[] {
  return adjacentFriendlyPieces(gameState, piece).filter((friendly) => friendly.type === "Pawn" && friendly.id !== piece.id);
}

function adjacentFriendlyPieces(gameState: GameState, piece: Piece): Piece[] {
  const from = getPiecePosition(gameState.board, piece.id);
  if (!from) {
    return [];
  }
  const result: Piece[] = [];
  for (const position of adjacentSquares(from)) {
    const pieceId = getSquare(gameState.board, position)?.pieceId;
    const neighbor = pieceId ? gameState.pieces[pieceId] : undefined;
    if (neighbor && neighbor.side === piece.side) {
      result.push(neighbor);
    }
  }
  return result;
}

function adjacentSquares(position: Position): Position[] {
  const squares: Position[] = [];
  for (let dc = -1; dc <= 1; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (dc === 0 && dr === 0) {
        continue;
      }
      const square = { col: position.col + dc, row: position.row + dr };
      if (isInsideBoard(square)) {
        squares.push(square);
      }
    }
  }
  return squares;
}

function emptyAdjacentSquares(gameState: GameState, position: Position): Position[] {
  return adjacentSquares(position).filter((square) => !getSquare(gameState.board, square)?.pieceId);
}

function samePosition(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

function rollDieIndex(): number {
  return Math.floor(Math.random() * 6);
}

function clampDieIndex(index: number): number {
  return Math.max(0, Math.min(5, Math.floor(index)));
}
