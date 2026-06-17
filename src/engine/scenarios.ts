import { createEmptyBoard, setPieceAt } from "./board";
import { GameState, Piece, PieceType, PlayerSide, Position } from "./types";
import { createInitialGameState } from "./gameState";
import { applyPromotionIfNeeded } from "./promotion";
import { DEFAULT_SELECTED_FACTIONS } from "../data/factions/testFactions";
import { createDefaultCards, createDefaultDrawState } from "./cards/cardEngine";

export type ScenarioId =
  | "standard"
  | "cannonHomeCapture"
  | "cannonOutsideHomeCombat"
  | "cannonInvalidNoScreen"
  | "cannonInvalidTwoScreen"
  | "cannonEnemyScreen"
  | "pawnPromotion"
  | "guardPromotionPermanence"
  | "redPromotion"
  | "pawnCrossedFrontier"
  | "attackerWinsTie"
  | "forcedAttackerWin"
  | "forcedDefenderWin";

export type ScenarioDefinition = {
  id: ScenarioId;
  name: string;
  description: string;
  group: "Standard" | "Cannon tests" | "Promotion tests" | "Combat tests";
  create: () => GameState;
};

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "standard",
    name: "Reset to standard starting position",
    description: "Full initial Frontier Chess setup.",
    group: "Standard",
    create: createInitialGameState,
  },
  {
    id: "cannonHomeCapture",
    name: "Cannon home capture test",
    description: "Blue Cannon at C1, Blue Pawn screen at C2, Red Pawn target at C5. Capture is direct from home.",
    group: "Cannon tests",
    create: () =>
      scenarioState([
        piece("blue-cannon", "Blue", "Cannon", { col: 2, row: 1 }),
        piece("blue-screen", "Blue", "Pawn", { col: 2, row: 2 }),
        piece("red-target", "Red", "Pawn", { col: 2, row: 5 }),
      ]),
  },
  {
    id: "cannonOutsideHomeCombat",
    name: "Cannon outside-home combat test",
    description: "Blue Cannon at C3, Blue Pawn screen at C4, Red Pawn target at C5. Capture triggers combat.",
    group: "Cannon tests",
    create: () =>
      scenarioState([
        piece("blue-cannon", "Blue", "Cannon", { col: 2, row: 3 }),
        piece("blue-screen", "Blue", "Pawn", { col: 2, row: 4 }),
        piece("red-target", "Red", "Pawn", { col: 2, row: 5 }),
      ]),
  },
  {
    id: "cannonInvalidNoScreen",
    name: "Cannon invalid no-screen test",
    description: "Blue Cannon at C1, Red Pawn at C5, no intervening piece. C5 is not legal.",
    group: "Cannon tests",
    create: () =>
      scenarioState([
        piece("blue-cannon", "Blue", "Cannon", { col: 2, row: 1 }),
        piece("red-target", "Red", "Pawn", { col: 2, row: 5 }),
      ]),
  },
  {
    id: "cannonInvalidTwoScreen",
    name: "Cannon invalid two-screen test",
    description: "Blue Cannon at C1, screens at C2 and C3, Red Pawn at C5. C5 is not legal.",
    group: "Cannon tests",
    create: () =>
      scenarioState([
        piece("blue-cannon", "Blue", "Cannon", { col: 2, row: 1 }),
        piece("blue-screen-1", "Blue", "Pawn", { col: 2, row: 2 }),
        piece("blue-screen-2", "Blue", "Pawn", { col: 2, row: 3 }),
        piece("red-target", "Red", "Pawn", { col: 2, row: 5 }),
      ]),
  },
  {
    id: "cannonEnemyScreen",
    name: "Cannon enemy-screen test",
    description: "Blue Cannon at C1, Red Pawn screen at C2, Red Pawn target at C5. Enemy screen is valid and capture is direct.",
    group: "Cannon tests",
    create: () =>
      scenarioState([
        piece("blue-cannon", "Blue", "Cannon", { col: 2, row: 1 }),
        piece("red-screen", "Red", "Pawn", { col: 2, row: 2 }),
        piece("red-target", "Red", "Pawn", { col: 2, row: 5 }),
      ]),
  },
  {
    id: "pawnPromotion",
    name: "Pawn promotion test",
    description: "Blue Pawn at D4 can move to D5 and become permanently promoted.",
    group: "Promotion tests",
    create: () => scenarioState([piece("blue-pawn", "Blue", "Pawn", { col: 3, row: 4 })]),
  },
  {
    id: "guardPromotionPermanence",
    name: "Guard promotion permanence test",
    description: "Blue Guard at D5 starts promoted and can move back to D4 while staying promoted.",
    group: "Promotion tests",
    create: () => scenarioState([{ ...piece("blue-guard", "Blue", "Guard", { col: 3, row: 5 }), promoted: true }]),
  },
  {
    id: "redPromotion",
    name: "Red promotion test",
    description: "Red Pawn at D4 can move to D3 and become permanently promoted.",
    group: "Promotion tests",
    create: () => scenarioState([piece("red-pawn", "Red", "Pawn", { col: 3, row: 4 })], "Red"),
  },
  {
    id: "pawnCrossedFrontier",
    name: "Pawn crossed Frontier Line test",
    description: "Blue Pawn at D5 can use the post-crossing five-direction rule.",
    group: "Promotion tests",
    create: () =>
      scenarioState([
        piece("blue-pawn", "Blue", "Pawn", { col: 3, row: 5 }),
        piece("red-forward", "Red", "Pawn", { col: 3, row: 6 }),
        piece("red-left", "Red", "Pawn", { col: 2, row: 5 }),
        piece("red-right", "Red", "Pawn", { col: 4, row: 5 }),
      ]),
  },
  {
    id: "attackerWinsTie",
    name: "Attacker wins tie test",
    description: "Blue Knight at D3 attacks Red Pawn at E5 with forced equal rolls.",
    group: "Combat tests",
    create: () => ({
      ...scenarioState([
        piece("blue-knight", "Blue", "Knight", { col: 3, row: 3 }),
        piece("red-pawn", "Red", "Pawn", { col: 4, row: 5 }),
      ]),
      forcedDice: { attackerValue: 4, defenderValue: 4 },
    }),
  },
  {
    id: "forcedAttackerWin",
    name: "Forced attacker win",
    description: "Blue Knight attacks Red Pawn in the Frontier Zone with forced 6 vs 2.",
    group: "Combat tests",
    create: () => ({
      ...scenarioState([
        piece("blue-knight", "Blue", "Knight", { col: 3, row: 3 }),
        piece("red-pawn", "Red", "Pawn", { col: 4, row: 5 }),
      ]),
      forcedDice: { attackerValue: 6, defenderValue: 2 },
    }),
  },
  {
    id: "forcedDefenderWin",
    name: "Forced defender win",
    description: "Blue Bishop attacks Red Knight in the Frontier Zone with forced 1 vs 6.",
    group: "Combat tests",
    create: () => ({
      ...scenarioState([
        piece("blue-bishop", "Blue", "Bishop", { col: 3, row: 3 }),
        piece("red-knight", "Red", "Knight", { col: 4, row: 4 }),
      ]),
      forcedDice: { attackerValue: 1, defenderValue: 6 },
    }),
  },
];

export function createScenario(id: ScenarioId): GameState {
  return SCENARIOS.find((scenario) => scenario.id === id)?.create() ?? createInitialGameState();
}

function scenarioState(entries: Array<Piece & { position: Position }>, turn: PlayerSide = "Blue"): GameState {
  let board = createEmptyBoard();
  const pieces: Record<string, Piece> = {};

  entries.forEach(({ position, ...entry }) => {
    const piece = applyPromotionIfNeeded(entry, position);
    pieces[piece.id] = piece;
    board = setPieceAt(board, position, piece.id);
  });

  const selectedFactions = { ...DEFAULT_SELECTED_FACTIONS };
  return {
    board,
    pieces,
    turn,
    turnNumber: 1,
    selectedFactions,
    cards: createDefaultCards(selectedFactions),
    drawState: createDefaultDrawState(),
    selectedPieceId: entries[0]?.id,
    log: ["Scenario loaded."],
    moveHistory: [],
  };
}

function piece(
  id: string,
  side: PlayerSide,
  type: PieceType,
  position: Position,
): Piece & { position: Position } {
  return { id, side, type, position };
}
