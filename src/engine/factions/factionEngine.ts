import { TEST_FACTIONS } from "../../data/factions/testFactions";
import { CombatModifier, GameState, Piece, PlayerSide, Position } from "../types";
import { FactionCard, FactionTimingWindow } from "./factionTypes";

export const FACTION_HOOKS_NO_EFFECT_MESSAGE = "Faction hooks checked: no implemented effects.";

export type FactionEffectContext = {
  debugText?: string;
};

export type BeforeCombatFactionContext = FactionEffectContext & {
  attacker: Piece;
  defender: Piece;
  attackerModifiers: CombatModifier[];
  defenderModifiers: CombatModifier[];
  gameState: GameState;
  target: Position;
};

export function getFactionCardsForTiming(
  gameState: GameState,
  side: PlayerSide,
  timing: FactionTimingWindow,
): FactionCard[] {
  const factionId = gameState.selectedFactions[side];
  const faction = TEST_FACTIONS.find((entry) => entry.id === factionId);
  return faction?.cards.filter((card) => card.timing === timing) ?? [];
}

export function applyBeforeCombatFactionEffects<TContext extends BeforeCombatFactionContext>(context: TContext): TContext {
  return withNoImplementedEffects(context);
}

export function applyAfterCombatFactionEffects<TContext extends FactionEffectContext>(context: TContext): TContext {
  return withNoImplementedEffects(context);
}

export function applyAfterMoveFactionEffects<TContext extends FactionEffectContext>(context: TContext): TContext {
  return withNoImplementedEffects(context);
}

function withNoImplementedEffects<TContext extends FactionEffectContext>(context: TContext): TContext {
  return {
    ...context,
    debugText: context.debugText ?? FACTION_HOOKS_NO_EFFECT_MESSAGE,
  };
}
