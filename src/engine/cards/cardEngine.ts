import { BASIC_CARDS } from "../../data/cards/basicCards";
import { TEST_FACTIONS } from "../../data/factions/testFactions";
import { getSquare, isFrontierLine, isHomeTerritory, isInsideBoard } from "../board";
import { CardStateBySide, DrawStateBySide, GameState, MoveRecord, PlayerDrawState, PlayerSide, Position, SelectedFactions } from "../types";
import { GameCard, PlayerCardState } from "./cardTypes";

export const DEFAULT_HAND_LIMIT = 2;
export const PASSIVE_DRAW_LIMIT = 5;
export const ACTIVE_DRAW_LIMIT = 2;

export function createDefaultCards(selectedFactions: SelectedFactions): CardStateBySide {
  return {
    Blue: createPlayerCardState(buildStartingDeck(selectedFactions.Blue)),
    Red: createPlayerCardState(buildStartingDeck(selectedFactions.Red)),
  };
}

export function createDefaultDrawState(): DrawStateBySide {
  return {
    Blue: createPlayerDrawState(),
    Red: createPlayerDrawState(),
  };
}

export function buildStartingDeck(factionId: string | null): GameCard[] {
  return [...BASIC_CARDS, ...getFactionGameCards(factionId)].map(cloneCard);
}

export function getCardById(cardId: string): GameCard | undefined {
  return getAllKnownCards().find((card) => card.id === cardId);
}

export function canDrawCard(gameState: GameState, side: PlayerSide): boolean {
  const cards = gameState.cards[side];
  return cards.hand.length < cards.handLimit && cards.deck.length > 0;
}

export function drawCard(gameState: GameState, side: PlayerSide): GameState {
  const cards = gameState.cards[side];
  if (cards.hand.length >= cards.handLimit) {
    return withCardLog(gameState, `${side} hand full. Draw skipped.`);
  }
  if (!cards.deck.length) {
    return withCardLog(gameState, `${side} deck empty. Draw skipped.`);
  }

  const [drawn, ...deck] = cards.deck;
  return withCardLog(
    {
      ...gameState,
      cards: {
        ...gameState.cards,
        [side]: {
          ...cards,
          deck,
          hand: [...cards.hand, drawn],
        },
      },
    },
    `${side} draws 1 card: ${drawn.name}.`,
  );
}

export function drawCards(gameState: GameState, side: PlayerSide, count: number): GameState {
  return Array.from({ length: Math.max(0, count) }).reduce<GameState>((nextState) => drawCard(nextState, side), gameState);
}

export function discardCard(gameState: GameState, side: PlayerSide, cardId: string): GameState {
  const cards = gameState.cards[side];
  const card = cards.hand.find((entry) => entry.id === cardId);
  if (!card) {
    return gameState;
  }

  return withCardLog(
    {
      ...gameState,
      cards: {
        ...gameState.cards,
        [side]: {
          ...cards,
          hand: cards.hand.filter((entry) => entry.id !== cardId),
          discard: [...cards.discard, card],
        },
      },
    },
    `${side} discards ${card.name}.`,
  );
}

export function moveCardFromHandToDiscard(gameState: GameState, side: PlayerSide, cardId: string): GameState {
  const cards = gameState.cards[side];
  const card = cards.hand.find((entry) => entry.id === cardId);
  if (!card) {
    return gameState;
  }
  return {
    ...gameState,
    cards: {
      ...gameState.cards,
      [side]: {
        ...cards,
        hand: cards.hand.filter((entry) => entry.id !== cardId),
        discard: [...cards.discard, card],
      },
    },
  };
}

export function hasCardInHand(gameState: GameState, side: PlayerSide, cardId: string): boolean {
  return gameState.cards[side].hand.some((card) => card.id === cardId);
}

export function canPlayCard(gameState: GameState, side: PlayerSide, cardId: string, context?: { timing?: GameCard["timing"] }): boolean {
  const card = gameState.cards[side].hand.find((entry) => entry.id === cardId);
  if (!card) {
    return false;
  }
  if (!card.implemented) {
    return false;
  }
  if (context?.timing && card.timing !== context.timing) {
    return false;
  }
  if (card.id === "basic_advance") {
    return gameState.turn === side && !gameState.activeMoveCard;
  }
  return true;
}

export function playCard(gameState: GameState, side: PlayerSide, cardId: string, context?: { timing?: GameCard["timing"] }): GameState {
  const card = gameState.cards[side].hand.find((entry) => entry.id === cardId);
  if (!card) {
    return gameState;
  }
  if (!card.implemented || (context?.timing && card.timing !== context.timing)) {
    return withCardLog(gameState, `${side} cannot play ${card.name}: card effect is not implemented.`);
  }
  if (card.id === "basic_advance") {
    if (!canPlayCard(gameState, side, cardId, context)) {
      return withCardLog(gameState, `${side} cannot play Advance right now.`);
    }
    return withCardLog({
      ...gameState,
      activeMoveCard: {
        side,
        cardId,
        cardName: "Advance",
      },
      selectedPieceId: undefined,
    }, `${side} plays Advance. Select a Pawn or Guard to move 2 squares forward.`);
  }
  return withCardLog(gameState, `${side} holds ${card.name}; play effects are not wired yet.`);
}

export function cancelActiveMoveCard(gameState: GameState, side: PlayerSide): GameState {
  if (!gameState.activeMoveCard || gameState.activeMoveCard.side !== side) {
    return gameState;
  }
  return withCardLog({
    ...gameState,
    activeMoveCard: undefined,
    selectedPieceId: undefined,
  }, `${side} cancels Advance.`);
}

export function getAdvanceMoves(gameState: GameState, pieceId: string): Position[] {
  const piece = gameState.pieces[pieceId];
  if (!piece || (piece.type !== "Pawn" && piece.type !== "Guard")) {
    return [];
  }
  const from = findPiecePosition(gameState, pieceId);
  if (!from) {
    return [];
  }
  const direction = piece.side === "Blue" ? 1 : -1;
  const intermediate = { col: from.col, row: from.row + direction };
  const destination = { col: from.col, row: from.row + direction * 2 };
  if (!isInsideBoard(intermediate) || !isInsideBoard(destination)) {
    return [];
  }
  if (getSquare(gameState.board, intermediate)?.pieceId || getSquare(gameState.board, destination)?.pieceId) {
    return [];
  }
  return [destination];
}

export function completeActiveMoveCard(gameState: GameState): GameState {
  const activeCard = gameState.activeMoveCard;
  if (!activeCard) {
    return gameState;
  }
  const cards = gameState.cards[activeCard.side];
  const card = cards.hand.find((entry) => entry.id === activeCard.cardId);
  if (!card) {
    return { ...gameState, activeMoveCard: undefined };
  }
  return {
    ...gameState,
    activeMoveCard: undefined,
    cards: {
      ...gameState.cards,
      [activeCard.side]: {
        ...cards,
        hand: cards.hand.filter((entry) => entry.id !== activeCard.cardId),
        discard: [...cards.discard, card],
      },
    },
  };
}

export function rebuildCardsForSelectedFactions(gameState: GameState, selectedFactions: SelectedFactions): GameState {
  return {
    ...gameState,
    selectedFactions,
    cards: createDefaultCards(selectedFactions),
    drawState: createDefaultDrawState(),
  };
}

export function applyCardDrawTriggersAfterMove(gameState: GameState, record: MoveRecord): GameState {
  let nextState = gameState;
  if (record.removedPiece) {
    nextState = handleCapturedPiece(nextState, record.removedPiece);
  }
  nextState = handleActiveMovementTriggers(nextState, record);
  return nextState;
}

export function normalizeCardState(
  selectedFactions: SelectedFactions,
  cards?: CardStateBySide,
  drawState?: DrawStateBySide,
): { cards: CardStateBySide; drawState: DrawStateBySide } {
  const defaults = createDefaultCards(selectedFactions);
  return {
    cards: {
      Blue: normalizePlayerCardState(cards?.Blue, defaults.Blue),
      Red: normalizePlayerCardState(cards?.Red, defaults.Red),
    },
    drawState: {
      Blue: normalizePlayerDrawState(drawState?.Blue),
      Red: normalizePlayerDrawState(drawState?.Red),
    },
  };
}

function handleCapturedPiece(gameState: GameState, removedPiece: MoveRecord["removedPiece"]): GameState {
  if (!removedPiece) {
    return gameState;
  }

  const side = removedPiece.side;
  const drawState = gameState.drawState[side];
  let nextState: GameState = {
    ...gameState,
    drawState: {
      ...gameState.drawState,
      [side]: {
        ...drawState,
        capturedPiecesCount: drawState.capturedPiecesCount + 1,
      },
    },
  };

  const updatedDrawState = nextState.drawState[side];
  if (updatedDrawState.capturedPiecesCount >= 3 && !updatedDrawState.hasDrawnForThreeCaptures) {
    nextState = drawForPassiveTrigger(
      nextState,
      side,
      `${side} has lost 3 pieces. ${side} draws 1.`,
      { hasDrawnForThreeCaptures: true },
    );
  }

  if (removedPiece.type === "Bishop") {
    nextState = discardHandAndDrawForBishop(nextState, side);
  }

  return nextState;
}

function handleActiveMovementTriggers(gameState: GameState, record: MoveRecord): GameState {
  const side = record.attacker.side;
  const drawState = gameState.drawState[side];
  let nextState = gameState;

  if (!drawState.hasDrawnForFirstFrontierCrossing && crossesFrontierLine(side, record.move.from, record.move.to)) {
    nextState = drawForActiveTrigger(
      nextState,
      side,
      `${side} crosses the Frontier Line for the first time. ${side} draws 1.`,
      { hasDrawnForFirstFrontierCrossing: true },
    );
  }

  if (!nextState.drawState[side].hasDrawnForFirstEnemyHomeEntry && entersEnemyHome(side, record.move.from, record.move.to)) {
    nextState = drawForActiveTrigger(
      nextState,
      side,
      `${side} enters enemy home territory for the first time. ${side} draws 1.`,
      { hasDrawnForFirstEnemyHomeEntry: true },
    );
  }

  return nextState;
}

function drawForPassiveTrigger(
  gameState: GameState,
  side: PlayerSide,
  message: string,
  flags: Partial<PlayerDrawState> = {},
): GameState {
  const drawState = gameState.drawState[side];
  if (drawState.passiveDrawsUsed >= PASSIVE_DRAW_LIMIT) {
    return updateDrawState(withCardLog(gameState, `${side} passive draw limit reached. Draw skipped.`), side, flags);
  }
  return drawCard(updateDrawState(withCardLog(gameState, message), side, {
    ...flags,
    passiveDrawsUsed: drawState.passiveDrawsUsed + 1,
  }), side);
}

function drawForActiveTrigger(
  gameState: GameState,
  side: PlayerSide,
  message: string,
  flags: Partial<PlayerDrawState>,
): GameState {
  const drawState = gameState.drawState[side];
  if (drawState.activeDrawsUsed >= ACTIVE_DRAW_LIMIT) {
    return updateDrawState(withCardLog(gameState, `${side} active draw limit reached. Draw skipped.`), side, flags);
  }
  return drawCard(updateDrawState(withCardLog(gameState, message), side, {
    ...flags,
    activeDrawsUsed: drawState.activeDrawsUsed + 1,
  }), side);
}

function discardHandAndDrawForBishop(gameState: GameState, side: PlayerSide): GameState {
  const cards = gameState.cards[side];
  const afterDiscard: GameState = {
    ...gameState,
    cards: {
      ...gameState.cards,
      [side]: {
        ...cards,
        hand: [],
        discard: [...cards.discard, ...cards.hand],
      },
    },
  };
  return drawForPassiveTrigger(afterDiscard, side, `${side} Bishop captured. ${side} discards hand and draws 1.`);
}

function updateDrawState(gameState: GameState, side: PlayerSide, patch: Partial<PlayerDrawState>): GameState {
  return {
    ...gameState,
    drawState: {
      ...gameState.drawState,
      [side]: {
        ...gameState.drawState[side],
        ...patch,
      },
    },
  };
}

function createPlayerCardState(deck: GameCard[]): PlayerCardState {
  return {
    deck,
    hand: [],
    discard: [],
    handLimit: DEFAULT_HAND_LIMIT,
  };
}

function createPlayerDrawState(): PlayerDrawState {
  return {
    passiveDrawsUsed: 0,
    activeDrawsUsed: 0,
    capturedPiecesCount: 0,
    hasDrawnForThreeCaptures: false,
    hasDrawnForFirstFrontierCrossing: false,
    hasDrawnForFirstEnemyHomeEntry: false,
  };
}

function normalizePlayerCardState(cards: PlayerCardState | undefined, defaults: PlayerCardState): PlayerCardState {
  return {
    deck: cards?.deck?.map(cloneCard) ?? defaults.deck,
    hand: cards?.hand?.map(cloneCard) ?? defaults.hand,
    discard: cards?.discard?.map(cloneCard) ?? defaults.discard,
    handLimit: cards?.handLimit ?? DEFAULT_HAND_LIMIT,
  };
}

function normalizePlayerDrawState(drawState: PlayerDrawState | undefined): PlayerDrawState {
  return {
    ...createPlayerDrawState(),
    ...drawState,
  };
}

function getFactionGameCards(factionId: string | null): GameCard[] {
  const faction = TEST_FACTIONS.find((entry) => entry.id === factionId);
  return faction
    ? faction.cards.map((card) => ({
        id: card.id,
        name: card.name,
        source: "Faction" as const,
        timing: card.timing,
        description: card.description,
        implemented: card.implemented,
      }))
    : [];
}

function getAllKnownCards(): GameCard[] {
  return [...BASIC_CARDS, ...TEST_FACTIONS.flatMap((faction) => getFactionGameCards(faction.id))].map(cloneCard);
}

function cloneCard(card: GameCard): GameCard {
  return { ...card };
}

function withCardLog(gameState: GameState, message: string): GameState {
  return {
    ...gameState,
    log: [message, ...gameState.log],
  };
}

function crossesFrontierLine(side: PlayerSide, from: MoveRecord["move"]["from"], to: MoveRecord["move"]["to"]): boolean {
  if (isFrontierLine(to)) {
    return true;
  }
  return side === "Blue"
    ? from.row <= 4 && to.row >= 5
    : from.row >= 4 && to.row <= 3;
}

function entersEnemyHome(side: PlayerSide, from: MoveRecord["move"]["from"], to: MoveRecord["move"]["to"]): boolean {
  const enemyHomeSide = side === "Blue" ? "Red" : "Blue";
  return !isHomeTerritory(enemyHomeSide, from) && isHomeTerritory(enemyHomeSide, to);
}

function findPiecePosition(gameState: GameState, pieceId: string): Position | undefined {
  for (const rank of gameState.board) {
    for (const square of rank) {
      if (square.pieceId === pieceId) {
        return square.position;
      }
    }
  }
  return undefined;
}
