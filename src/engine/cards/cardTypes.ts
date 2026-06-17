export type CardSource = "Basic" | "Faction";

export type CardTimingWindow =
  | "beforeMove"
  | "afterMove"
  | "beforeCombat"
  | "afterCombat"
  | "afterCapture"
  | "afterPiecePromoted"
  | "afterEnemyMove"
  | "passive";

export interface GameCard {
  id: string;
  name: string;
  source: CardSource;
  timing: CardTimingWindow;
  description: string;
  implemented: boolean;
}

export interface PlayerCardState {
  deck: GameCard[];
  hand: GameCard[];
  discard: GameCard[];
  handLimit: number;
}
