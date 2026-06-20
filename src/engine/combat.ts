import { getCombatProfileForPiece } from "./data/classProfiles";
import { getPiecePosition, isFrontierZone, isHomeTerritory } from "./board";
import { CombatModifier, CombatResult, ForcedDice, GameState, Piece, Position } from "./types";

export function shouldTriggerCombat(target: Position): boolean {
  return isFrontierZone(target);
}

export function shouldCannonCaptureUseCombat(state: GameState, cannon: Piece, target: Position): boolean {
  const from = getPiecePosition(state.board, cannon.id);
  if (!from || cannon.type !== "Cannon") {
    return shouldTriggerCombat(target);
  }

  if (isHomeTerritory(cannon.side, from)) {
    return false;
  }

  return shouldTriggerCombat(target);
}

export function resolveCombat(
  state: GameState,
  attacker: Piece,
  defender: Piece,
  target: Position,
  rollDieIndex: () => number = randomDieIndex,
  forcedDice: ForcedDice = {},
): CombatResult {
  const attackerRollIndex = clampDieIndex(forcedDice.attackerRollIndex ?? rollDieIndex());
  const defenderRollIndex = clampDieIndex(forcedDice.defenderRollIndex ?? rollDieIndex());
  const attackerBaseValue = forcedDice.attackerValue ?? getCombatProfileForPiece(attacker)[attackerRollIndex];
  const defenderBaseValue = forcedDice.defenderValue ?? getCombatProfileForPiece(defender)[defenderRollIndex];
  const attackerModifiers = forcedDice.attackerModifiers ?? [];
  const defenderModifiers = forcedDice.defenderModifiers ?? [];
  const attackerFinalValue = applyModifiers(attackerBaseValue, attackerModifiers);
  const defenderFinalValue = applyModifiers(defenderBaseValue, defenderModifiers);
  const attackerWon = attackerFinalValue >= defenderFinalValue;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerRollIndex,
    defenderRollIndex,
    attackerOriginalRollIndex: forcedDice.attackerOriginalRollIndex,
    defenderOriginalRollIndex: forcedDice.defenderOriginalRollIndex,
    attackerBaseValue,
    defenderBaseValue,
    attackerOriginalBaseValue: forcedDice.attackerOriginalValue,
    defenderOriginalBaseValue: forcedDice.defenderOriginalValue,
    attackerModifiers,
    defenderModifiers,
    attackerFinalValue,
    defenderFinalValue,
    attackerValue: attackerFinalValue,
    defenderValue: defenderFinalValue,
    winner: attackerWon ? attacker.side : defender.side,
    attackerWon,
    target,
    forcedDice: !forcedDice.manualRoll && (
      forcedDice.attackerValue !== undefined ||
      forcedDice.defenderValue !== undefined ||
      forcedDice.attackerRollIndex !== undefined ||
      forcedDice.defenderRollIndex !== undefined
    ),
    manualRoll: forcedDice.manualRoll || undefined,
    attackerAutoRolled: forcedDice.attackerAutoRolled || undefined,
    defenderAutoRolled: forcedDice.defenderAutoRolled || undefined,
    attackerUsedGambit: forcedDice.attackerUsedGambit || undefined,
    defenderUsedGambit: forcedDice.defenderUsedGambit || undefined,
  };
}

export function applyModifiers(baseValue: number, modifiers: readonly CombatModifier[]): number {
  return modifiers.reduce((total, modifier) => total + modifier.value, baseValue);
}

function randomDieIndex(): number {
  return Math.floor(Math.random() * 6);
}

function clampDieIndex(index: number): number {
  return Math.max(0, Math.min(5, Math.floor(index)));
}
