import { coordinateLabel } from "./board";
import { applyModifiers } from "./combat";
import { getCombatProfileForPiece, getCombatProfileNameForPiece } from "./data/classProfiles";
import { applyBeforeCombatFactionEffects } from "./factions/factionEngine";
import { GameState, LegalMove, PendingCombat, Piece, PlayerSide } from "./types";
import { hasCardInHand } from "./cards/cardEngine";

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
  const factionContext = applyBeforeCombatFactionEffects({
    attacker,
    defender,
    attackerModifiers: [],
    defenderModifiers: [],
    gameState: state,
    target: move.to,
  });

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
    attackerModifiers: factionContext.attackerModifiers,
    defenderModifiers: factionContext.defenderModifiers,
    startedAt: now,
    rollDeadlineAt: now + COMBAT_ROLL_TIMEOUT_MS,
    status: "waitingForAttackerRoll",
  };
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

export function autoRollExpiredPendingCombat(pendingCombat: PendingCombat, now = Date.now()): PendingCombat {
  if (pendingCombat.status === "gambitWindow" && now >= (pendingCombat.gambitWindowDeadlineAt ?? Number.POSITIVE_INFINITY)) {
    return revealPendingCombat({
      ...pendingCombat,
      attackerPassedGambit: pendingCombat.attackerPassedGambit || !pendingCombat.attackerUsedGambit,
      defenderPassedGambit: pendingCombat.defenderPassedGambit || !pendingCombat.defenderUsedGambit,
    });
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
  };
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
    });
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
    });
  }
  return pendingCombat;
}

export function passPendingCombatGambit(pendingCombat: PendingCombat, side: PlayerSide): PendingCombat {
  if (pendingCombat.status !== "gambitWindow") {
    return pendingCombat;
  }
  if (side === pendingCombat.attackerSide) {
    return withGambitResponse({ ...pendingCombat, attackerPassedGambit: true });
  }
  if (side === pendingCombat.defenderSide) {
    return withGambitResponse({ ...pendingCombat, defenderPassedGambit: true });
  }
  return pendingCombat;
}

export function getPendingCombatFinalValue(pendingCombat: PendingCombat, role: "attacker" | "defender"): number {
  if (role === "attacker") {
    return pendingCombat.attackerFinalValue ??
      applyModifiers(pendingCombat.attackerProfileValue ?? 0, pendingCombat.attackerModifiers ?? []);
  }
  return pendingCombat.defenderFinalValue ??
    applyModifiers(pendingCombat.defenderProfileValue ?? 0, pendingCombat.defenderModifiers ?? []);
}

export function canSideRollPendingCombat(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  return (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) ||
    (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined);
}

function withStatus(pendingCombat: PendingCombat, gameState?: GameState): PendingCombat {
  if (pendingCombat.attackerDieIndex !== undefined && pendingCombat.defenderDieIndex !== undefined) {
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
    return revealPendingCombat(pendingCombat);
  }
  if (pendingCombat.attackerDieIndex === undefined && pendingCombat.defenderDieIndex === undefined) {
    return { ...pendingCombat, status: "waitingForBothRolls" };
  }
  if (pendingCombat.attackerDieIndex === undefined) {
    return { ...pendingCombat, status: "waitingForAttackerRoll" };
  }
  return { ...pendingCombat, status: "waitingForDefenderRoll" };
}

function revealPendingCombat(pendingCombat: PendingCombat): PendingCombat {
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

function withGambitResponse(pendingCombat: PendingCombat): PendingCombat {
  const attackerDone = pendingCombat.attackerUsedGambit || pendingCombat.attackerPassedGambit;
  const defenderDone = pendingCombat.defenderUsedGambit || pendingCombat.defenderPassedGambit;
  return attackerDone && defenderDone ? revealPendingCombat(pendingCombat) : pendingCombat;
}

function rollDieIndex(): number {
  return Math.floor(Math.random() * 6);
}

function clampDieIndex(index: number): number {
  return Math.max(0, Math.min(5, Math.floor(index)));
}
