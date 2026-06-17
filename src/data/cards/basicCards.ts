import { GameCard } from "../../engine/cards/cardTypes";

export const BASIC_CARDS: readonly GameCard[] = [
  {
    id: "basic_gambit",
    name: "Gambit",
    source: "Basic",
    timing: "afterCombat",
    description: "After both combat dice are revealed, reroll your own combat die once.",
    implemented: true,
  },
  {
    id: "basic_advance",
    name: "Advance",
    source: "Basic",
    timing: "beforeMove",
    description: "Before moving, a Pawn or Guard may move exactly two squares straight forward without capturing.",
    implemented: true,
  },
];
