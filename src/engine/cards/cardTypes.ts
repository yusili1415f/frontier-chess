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
  /**
   * Unique card-copy id used while the card is in a player's deck, hand, or discard.
   * Single-copy legacy cards may have the same id as their definition.
   */
  id: string;
  definitionId?: string;
  name: string;
  source: CardSource;
  factionCardType?: "Banner" | "Order" | "Relic";
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
