export type FactionCardType = "Banner" | "Order" | "Relic";

export type FactionTimingWindow =
  | "passive"
  | "beforeMove"
  | "afterMove"
  | "beforeCombat"
  | "afterCombat"
  | "afterCapture"
  | "afterPiecePromoted"
  | "afterEnemyMove";

export interface FactionCard {
  id: string;
  name: string;
  type: FactionCardType;
  timing: FactionTimingWindow;
  description: string;
  implemented: boolean;
}

export interface Faction {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  cards: FactionCard[];
}

export type { SelectedFactions } from "../types";
