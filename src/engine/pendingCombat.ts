import { coordinateLabel } from "./board";
import { getCombatProfileForPiece, getCombatProfileNameForPiece } from "./data/classProfiles";
import { GameState, LegalMove, PendingCombat, Piece, PlayerSide } from "./types";

export const COMBAT_ROLL_TIMEOUT_MS = 15_000;
export const COMBAT_RESULT_REVEAL_MS = 2_000;

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
    startedAt: now,
    rollDeadlineAt: now + COMBAT_ROLL_TIMEOUT_MS,
    status: "waitingForAttackerRoll",
  };
}

export function rollPendingCombatSide(
  pendingCombat: PendingCombat,
  side: PlayerSide,
  options: { dieIndex?: number; autoRolled?: boolean } = {},
): PendingCombat {
  const dieIndex = clampDieIndex(options.dieIndex ?? rollDieIndex());
  const autoRolled = options.autoRolled === true;

  if (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) {
    const next = {
      ...pendingCombat,
      attackerDieIndex: dieIndex,
      attackerProfileValue: pendingCombat.attackerProfile[dieIndex],
      attackerAutoRolled: autoRolled || undefined,
    };
    return withStatus(next);
  }

  if (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined) {
    const next = {
      ...pendingCombat,
      defenderDieIndex: dieIndex,
      defenderProfileValue: pendingCombat.defenderProfile[dieIndex],
      defenderAutoRolled: autoRolled || undefined,
    };
    return withStatus(next);
  }

  return pendingCombat;
}

export function autoRollExpiredPendingCombat(pendingCombat: PendingCombat, now = Date.now()): PendingCombat {
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

  return pendingCombat.attackerProfileValue >= pendingCombat.defenderProfileValue
    ? pendingCombat.attackerSide
    : pendingCombat.defenderSide;
}

export function pendingCombatToForcedDice(pendingCombat: PendingCombat) {
  return {
    attackerRollIndex: pendingCombat.attackerDieIndex,
    defenderRollIndex: pendingCombat.defenderDieIndex,
    attackerValue: pendingCombat.attackerProfileValue,
    defenderValue: pendingCombat.defenderProfileValue,
    attackerAutoRolled: pendingCombat.attackerAutoRolled,
    defenderAutoRolled: pendingCombat.defenderAutoRolled,
  };
}

export function canSideRollPendingCombat(pendingCombat: PendingCombat, side: PlayerSide): boolean {
  return (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) ||
    (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined);
}

function withStatus(pendingCombat: PendingCombat): PendingCombat {
  if (pendingCombat.attackerDieIndex !== undefined && pendingCombat.defenderDieIndex !== undefined) {
    const isTie = pendingCombat.attackerProfileValue === pendingCombat.defenderProfileValue;
    const attackerWins = (pendingCombat.attackerProfileValue ?? 0) >= (pendingCombat.defenderProfileValue ?? 0);
    const resultRevealedAt = Date.now();
    return {
      ...pendingCombat,
      status: "revealingResult",
      resultRevealedAt,
      resolveAfterAt: resultRevealedAt + COMBAT_RESULT_REVEAL_MS,
      winnerSide: attackerWins ? pendingCombat.attackerSide : pendingCombat.defenderSide,
      attackerWins,
      isTie,
    };
  }
  if (pendingCombat.attackerDieIndex === undefined) {
    return { ...pendingCombat, status: "waitingForAttackerRoll" };
  }
  return { ...pendingCombat, status: "waitingForDefenderRoll" };
}

function rollDieIndex(): number {
  return Math.floor(Math.random() * 6);
}

function clampDieIndex(index: number): number {
  return Math.max(0, Math.min(5, Math.floor(index)));
}
