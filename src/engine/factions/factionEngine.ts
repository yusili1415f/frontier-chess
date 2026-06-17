import { GameState } from "../types";
import { FactionDefinition, FactionEngineContext, FactionId, FactionSelection } from "./factionTypes";

export function createFactionContext(selection: FactionSelection = {}): FactionEngineContext {
  return { selection };
}

export function getFactionForSide(
  factions: readonly FactionDefinition[],
  selection: FactionSelection,
  side: "Blue" | "Red",
): FactionDefinition | undefined {
  const factionId = selection[side];
  return factionId ? factions.find((faction) => faction.id === factionId) : undefined;
}

export function isFactionSelected(selection: FactionSelection, factionId: FactionId): boolean {
  return Object.values(selection).includes(factionId);
}

export function applyFactionSetup(state: GameState, _context: FactionEngineContext): GameState {
  return state;
}
