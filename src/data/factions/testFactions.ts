import { FactionDefinition } from "../../engine/factions/factionTypes";

export const TEST_FACTIONS: readonly FactionDefinition[] = [
  {
    id: "test-vanguard",
    name: "Test Vanguard",
    status: "placeholder",
    summary: "Aggressive faction slot reserved for movement and opening pressure experiments.",
    pieceModifiers: [],
  },
  {
    id: "test-bastion",
    name: "Test Bastion",
    status: "placeholder",
    summary: "Defensive faction slot reserved for guard, cannon, and territory experiments.",
    pieceModifiers: [],
  },
];
