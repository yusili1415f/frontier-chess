import { BASIC_CARDS } from "../../data/cards/basicCards";
import { TEST_FACTIONS } from "../../data/factions/testFactions";
import { getSquare, isFrontierLine, isHomeTerritory, isInsideBoard } from "../board";
import { CardStateBySide, DrawStateBySide, GameState, MoveRecord, PlayerDrawState, PlayerSide, Position, SelectedFactions, TurnActionStateBySide } from "../types";
import { GameCard, PlayerCardState } from "./cardTypes";

export const DEFAULT_HAND_LIMIT = 2;
export const PASSIVE_DRAW_LIMIT = 5;
export const ACTIVE_DRAW_LIMIT = 2;

export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createDefaultCards(selectedFactions: SelectedFactions, options: { shuffle?: boolean; rng?: () => number } = {}): CardStateBySide {
  const maybeShuffle = (deck: GameCard[]) => options.shuffle === false ? deck : shuffleArray(deck, options.rng);
  return {
    Blue: createPlayerCardState(maybeShuffle(buildStartingDeck(selectedFactions.Blue))),
    Red: createPlayerCardState(maybeShuffle(buildStartingDeck(selectedFactions.Red))),
  };
}

export function createDefaultDrawState(): DrawStateBySide {
  return {
    Blue: createPlayerDrawState(),
    Red: createPlayerDrawState(),
  };
}

export function createDefaultTurnActions(): TurnActionStateBySide {
  return {
    Blue: createPlayerTurnActionState(),
    Red: createPlayerTurnActionState(),
  };
}

export function buildStartingDeck(factionId: string | null): GameCard[] {
  const factionCards = getFactionGameCards(factionId);
  const advance = BASIC_CARDS.find((card) => card.id === "basic_advance");
  const gambit = BASIC_CARDS.find((card) => card.id === "basic_gambit");
  const banner = factionCards.find((card) => card.factionCardType === "Banner");
  const order = factionCards.find((card) => card.factionCardType === "Order");
  const relic = factionCards.find((card) => card.factionCardType === "Relic");
  return [
    ...(advance ? [createCardInstance(advance, "basic_advance")] : []),
    ...(gambit ? [createCardInstance(gambit, "basic_gambit")] : []),
    ...(banner ? [createCardInstance(banner, `${banner.id}_1`), createCardInstance(banner, `${banner.id}_2`)] : []),
    ...(order ? [createCardInstance(order, `${order.id}_1`), createCardInstance(order, `${order.id}_2`)] : []),
    ...(relic ? [createCardInstance(relic, `${relic.id}_1`)] : []),
  ];
}

export function getCardById(cardId: string): GameCard | undefined {
  const known = getAllKnownCards().find((card) => card.id === cardId || card.definitionId === cardId);
  if (known) {
    return cloneCard(known);
  }
  const definitionId = stripCopySuffix(cardId);
  const definition = getAllKnownCards().find((card) => card.id === definitionId || card.definitionId === definitionId);
  return definition ? createCardInstance(definition, cardId) : undefined;
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
  const card = findCardInHand(cards, cardId);
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
          hand: removeCardFromHand(cards.hand, card.id),
          discard: [...cards.discard, card],
        },
      },
    },
    `${side} discards ${card.name}.`,
  );
}

export function voluntaryDiscardCards(gameState: GameState, side: PlayerSide, cardIds: string[]): GameState {
  if (
    gameState.turn !== side ||
    gameState.activeMoveCard ||
    gameState.turnActions[side].voluntaryDiscardUsedThisTurn ||
    cardIds.length > gameState.cards[side].handLimit
  ) {
    return gameState;
  }
  const cards = gameState.cards[side];
  const selectedIds = [...new Set(cardIds)].slice(0, cards.handLimit);
  let hand = [...cards.hand];
  const discarded: GameCard[] = [];
  selectedIds.forEach((cardId) => {
    const card = findCardInList(hand, cardId);
    if (!card) {
      return;
    }
    discarded.push(card);
    hand = removeCardFromHand(hand, card.id);
  });

  const message = discarded.length === 0
    ? `${side} skips voluntary discard.`
    : `${side} discards ${discarded.length} card${discarded.length === 1 ? "" : "s"}.`;
  return {
    ...gameState,
    cards: {
      ...gameState.cards,
      [side]: {
        ...cards,
        hand,
        discard: [...cards.discard, ...discarded],
      },
    },
    turnActions: {
      ...gameState.turnActions,
      [side]: {
        voluntaryDiscardUsedThisTurn: true,
      },
    },
    log: [message, ...gameState.log],
  };
}

export function moveCardFromHandToDiscard(gameState: GameState, side: PlayerSide, cardId: string): GameState {
  const cards = gameState.cards[side];
  const card = findCardInHand(cards, cardId);
  if (!card) {
    return gameState;
  }
  return {
    ...gameState,
    cards: {
      ...gameState.cards,
      [side]: {
        ...cards,
        hand: removeCardFromHand(cards.hand, card.id),
        discard: [...cards.discard, card],
      },
    },
  };
}

export function hasCardInHand(gameState: GameState, side: PlayerSide, cardId: string): boolean {
  return gameState.cards[side].hand.some((card) => isCardMatch(card, cardId));
}

export function canPlayCard(gameState: GameState, side: PlayerSide, cardId: string, context?: { timing?: GameCard["timing"] }): boolean {
  const card = findCardInHand(gameState.cards[side], cardId);
  if (!card) {
    return false;
  }
  if (!card.implemented) {
    return false;
  }
  if (context?.timing && card.timing !== context.timing) {
    return false;
  }
  if (cardDefinitionId(card) === "basic_advance") {
    return gameState.turn === side && !gameState.activeMoveCard;
  }
  if (cardDefinitionId(card) === "banner_drill") {
    return gameState.turn === side && !gameState.activeMoveCard;
  }
  if (cardDefinitionId(card) === "breakthrough_charge" || cardDefinitionId(card) === "crownbreaker_charge") {
    return gameState.turn === side &&
      gameState.selectedFactions[side] === "iron_crown_cavalry" &&
      !gameState.activeMoveCard;
  }
  if (cardDefinitionId(card) === "raise_the_fallen" || cardDefinitionId(card) === "necromancers_bell") {
    return gameState.turn === side &&
      gameState.selectedFactions[side] === "bone_legion" &&
      !gameState.activeMoveCard &&
      getEligibleBoneRevivalPieces(gameState, side, cardDefinitionId(card)).length > 0 &&
      getEmptyHomeZoneSquares(gameState, side).length > 0;
  }
  return true;
}

export function playCard(gameState: GameState, side: PlayerSide, cardId: string, context?: { timing?: GameCard["timing"] }): GameState {
  const card = findCardInHand(gameState.cards[side], cardId);
  if (!card) {
    return gameState;
  }
  if (!card.implemented || (context?.timing && card.timing !== context.timing)) {
    return withCardLog(gameState, `${side} cannot play ${card.name}: card effect is not implemented.`);
  }
  if (cardDefinitionId(card) === "basic_advance") {
    if (!canPlayCard(gameState, side, cardId, context)) {
      return withCardLog(gameState, `${side} cannot play Advance right now.`);
    }
    return withCardLog({
      ...gameState,
      activeMoveCard: {
        side,
        cardId: card.id,
        cardName: "Advance",
      },
      selectedPieceId: undefined,
    }, `${side} plays Advance. Select a Pawn or Guard to move 2 squares forward.`);
  }
  if (cardDefinitionId(card) === "banner_drill") {
    if (!canPlayCard(gameState, side, card.id, context)) {
      return withCardLog(gameState, `${side} cannot play Banner Drill right now.`);
    }
    return withCardLog({
      ...gameState,
      activeMoveCard: {
        side,
        cardId: card.id,
        cardName: "Banner Drill",
        phase: "selectPiece",
      },
      selectedPieceId: undefined,
    }, `${side} plays Banner Drill. Select a friendly Guard.`);
  }
  if (cardDefinitionId(card) === "breakthrough_charge" || cardDefinitionId(card) === "crownbreaker_charge") {
    if (!canPlayCard(gameState, side, card.id, context)) {
      return withCardLog(gameState, `${side} cannot play ${card.name} right now.`);
    }
    return withCardLog({
      ...gameState,
      activeMoveCard: {
        side,
        cardId: card.id,
        cardDefinitionId: cardDefinitionId(card),
        cardName: card.name as "Breakthrough Charge" | "Crownbreaker Charge",
        phase: "selectPiece",
        captureCountThisTurn: 0,
      },
      selectedPieceId: undefined,
    }, `${side} plays ${card.name}. Select a friendly Knight.`);
  }
  if (cardDefinitionId(card) === "raise_the_fallen" || cardDefinitionId(card) === "necromancers_bell") {
    if (!canPlayCard(gameState, side, card.id, context)) {
      return withCardLog(gameState, `${side} cannot play ${card.name} right now.`);
    }
    return withCardLog({
      ...gameState,
      activeMoveCard: {
        side,
        cardId: card.id,
        cardDefinitionId: cardDefinitionId(card),
        cardName: card.name as "Raise the Fallen" | "Necromancer's Bell",
        phase: "selectRemovedPiece",
      },
      selectedPieceId: undefined,
    }, `${side} plays ${card.name}. Choose a removed piece to return.`);
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
  }, `${side} cancels ${gameState.activeMoveCard.cardName}.`);
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
  const card = findCardInHand(cards, activeCard.cardId);
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
        hand: removeCardFromHand(cards.hand, card.id),
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
    turnActions: createDefaultTurnActions(),
  };
}

export function getEligibleBoneRevivalPieces(gameState: GameState, side: PlayerSide, definitionId: string): GameState["removedPieces"][PlayerSide] {
  const allowed = definitionId === "raise_the_fallen"
    ? new Set(["Pawn"])
    : new Set(["Pawn", "Guard"]);
  return gameState.removedPieces[side].filter((piece) => allowed.has(piece.type));
}

export function getEmptyHomeZoneSquares(gameState: GameState, side: PlayerSide): Position[] {
  const squares: Position[] = [];
  gameState.board.forEach((rank) => {
    rank.forEach((square) => {
      if (isHomeTerritory(side, square.position) && !square.pieceId) {
        squares.push(square.position);
      }
    });
  });
  return squares;
}

export function applyCardDrawTriggersAfterMove(gameState: GameState, record: MoveRecord): GameState {
  let nextState = gameState;
  if (record.removedPiece) {
    nextState = handleCapturedPiece(nextState, record.removedPiece);
  }
  if (record.removedPiece?.type === "King" || nextState.winner) {
    return nextState;
  }
  nextState = handleActiveMovementTriggers(nextState, record);
  return nextState;
}

export function normalizeCardState(
  selectedFactions: SelectedFactions,
  cards?: CardStateBySide,
  drawState?: DrawStateBySide,
  turnActions?: TurnActionStateBySide,
): { cards: CardStateBySide; drawState: DrawStateBySide; turnActions: TurnActionStateBySide } {
  const defaults = createDefaultCards(selectedFactions, { shuffle: false });
  return {
    cards: {
      Blue: normalizePlayerCardState(cards?.Blue, defaults.Blue),
      Red: normalizePlayerCardState(cards?.Red, defaults.Red),
    },
    drawState: {
      Blue: normalizePlayerDrawState(drawState?.Blue),
      Red: normalizePlayerDrawState(drawState?.Red),
    },
    turnActions: {
      Blue: normalizePlayerTurnActionState(turnActions?.Blue),
      Red: normalizePlayerTurnActionState(turnActions?.Red),
    },
  };
}

function handleCapturedPiece(gameState: GameState, removedPiece: MoveRecord["removedPiece"]): GameState {
  if (!removedPiece) {
    return gameState;
  }

  const side = removedPiece.side;
  if (removedPiece.type === "King") {
    return withCardLog(gameState, `${side} King captured. Game over.`);
  }

  if (removedPiece.type === "Bishop") {
    return discardHandAndDrawForBishop(updateDrawState(gameState, side, {
      capturedPiecesCount: gameState.drawState[side].capturedPiecesCount + 1,
    }), side);
  }

  const drawState = gameState.drawState[side];
  const eligibleCapturedCount = drawState.eligibleCapturedCount + 1;
  let nextState: GameState = {
    ...gameState,
    drawState: {
      ...gameState.drawState,
      [side]: {
        ...drawState,
        capturedPiecesCount: drawState.capturedPiecesCount + 1,
        eligibleCapturedCount,
      },
    },
  };

  const updatedDrawState = nextState.drawState[side];
  const expectedPassiveDraws = Math.min(PASSIVE_DRAW_LIMIT, Math.floor(updatedDrawState.eligibleCapturedCount / 3));
  if (expectedPassiveDraws > updatedDrawState.passiveDrawsUsed) {
    const draws = expectedPassiveDraws - updatedDrawState.passiveDrawsUsed;
    nextState = drawForPassiveTrigger(
      nextState,
      side,
      `${side} has lost ${updatedDrawState.eligibleCapturedCount} eligible pieces. ${side} draws ${draws} passive card${draws === 1 ? "" : "s"}.`,
      { hasDrawnForThreeCaptures: true },
      draws,
    );
  }

  return nextState;
}

function handleActiveMovementTriggers(gameState: GameState, record: MoveRecord): GameState {
  const side = record.attacker.side;
  const drawState = gameState.drawState[side];
  let nextState = gameState;

  if (!drawState.hasDrawnForFirstEnemyHomeEntry && entersEnemyHome(side, record.move.from, record.move.to)) {
    nextState = drawForActiveTrigger(
      nextState,
      side,
      `${side} enters enemy home territory for the first time. ${side} draws 1 active card.`,
      { hasDrawnForFirstEnemyHomeEntry: true },
    );
    return nextState;
  }

  if (!drawState.hasDrawnForFirstFrontierCrossing && crossesFrontierLine(side, record.move.from, record.move.to)) {
    nextState = drawForActiveTrigger(
      nextState,
      side,
      `${side} crosses the Frontier Line for the first time. ${side} draws 1 active card.`,
      { hasDrawnForFirstFrontierCrossing: true },
    );
  }

  return nextState;
}

function drawForPassiveTrigger(
  gameState: GameState,
  side: PlayerSide,
  message: string,
  flags: Partial<PlayerDrawState> = {},
  count = 1,
): GameState {
  const drawState = gameState.drawState[side];
  if (drawState.passiveDrawsUsed >= PASSIVE_DRAW_LIMIT) {
    return updateDrawState(withCardLog(gameState, `${side} passive draw limit reached. Draw skipped.`), side, flags);
  }
  return drawCards(updateDrawState(withCardLog(gameState, message), side, {
    ...flags,
    passiveDrawsUsed: Math.min(PASSIVE_DRAW_LIMIT, drawState.passiveDrawsUsed + count),
  }), side, count);
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
  return drawCard(withCardLog(afterDiscard, `${side} Bishop captured. ${side} discards hand and draws 1.`), side);
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
    eligibleCapturedCount: 0,
    capturedPiecesCount: 0,
    hasDrawnForThreeCaptures: false,
    hasDrawnForFirstFrontierCrossing: false,
    hasDrawnForFirstEnemyHomeEntry: false,
  };
}

function createPlayerTurnActionState() {
  return {
    voluntaryDiscardUsedThisTurn: false,
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

function normalizePlayerTurnActionState(turnActionState: { voluntaryDiscardUsedThisTurn?: boolean } | undefined) {
  return {
    ...createPlayerTurnActionState(),
    ...turnActionState,
  };
}

function getFactionGameCards(factionId: string | null): GameCard[] {
  const faction = TEST_FACTIONS.find((entry) => entry.id === factionId);
  return faction
    ? faction.cards.map((card) => ({
        id: card.id,
        definitionId: card.id,
        name: card.name,
        source: "Faction" as const,
        factionCardType: card.type,
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

function createCardInstance(card: GameCard, instanceId: string): GameCard {
  return {
    ...cloneCard(card),
    id: instanceId,
    definitionId: card.definitionId ?? card.id,
  };
}

export function cardDefinitionId(card: GameCard): string {
  return card.definitionId ?? stripCopySuffix(card.id);
}

function stripCopySuffix(cardId: string): string {
  return cardId.replace(/_[12]$/, "");
}

function findCardInHand(cards: PlayerCardState, cardId: string): GameCard | undefined {
  return findCardInList(cards.hand, cardId);
}

function findCardInList(cards: GameCard[], cardId: string): GameCard | undefined {
  return cards.find((entry) => entry.id === cardId) ?? cards.find((entry) => isCardMatch(entry, cardId));
}

function isCardMatch(card: GameCard, cardId: string): boolean {
  return card.id === cardId || cardDefinitionId(card) === cardId;
}

function removeCardFromHand(hand: GameCard[], cardId: string): GameCard[] {
  let removed = false;
  return hand.filter((card) => {
    if (!removed && card.id === cardId) {
      removed = true;
      return false;
    }
    return true;
  });
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
