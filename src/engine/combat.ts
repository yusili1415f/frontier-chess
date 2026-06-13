import { getCombatProfileForPiece } from "./data/classProfiles";
import { getPiecePosition, isFrontierZone, isHomeTerritory } from "./board";
import { CombatResult, ForcedDice, GameState, Piece, Position } from "./types";

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
  attacker: Piece,
  defender: Piece,
  target: Position,
  rollDieIndex: () => number = randomDieIndex,
  forcedDice: ForcedDice = {},
): CombatResult {
  const attackerRollIndex = clampDieIndex(forcedDice.attackerRollIndex ?? rollDieIndex());
  const defenderRollIndex = clampDieIndex(forcedDice.defenderRollIndex ?? rollDieIndex());
  const attackerValue = forcedDice.attackerValue ?? getCombatProfileForPiece(attacker)[attackerRollIndex];
  const defenderValue = forcedDice.defenderValue ?? getCombatProfileForPiece(defender)[defenderRollIndex];
  const attackerWon = attackerValue >= defenderValue;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerRollIndex,
    defenderRollIndex,
    attackerValue,
    defenderValue,
    winner: attackerWon ? attacker.side : defender.side,
    attackerWon,
    target,
    forcedDice: forcedDice.attackerValue !== undefined ||
      forcedDice.defenderValue !== undefined ||
      forcedDice.attackerRollIndex !== undefined ||
      forcedDice.defenderRollIndex !== undefined,
  };
}

function randomDieIndex(): number {
  return Math.floor(Math.random() * 6);
}

function clampDieIndex(index: number): number {
  return Math.max(0, Math.min(5, Math.floor(index)));
}
