import { coordinateLabel, createEmptyBoard, getPiecePosition, setPieceAt } from "../board";
import { DEFAULT_SELECTED_FACTIONS } from "../../data/factions/testFactions";
import { DEFAULT_HAND_LIMIT, getCardById, normalizeCardState } from "../cards/cardEngine";
import { GameState, MoveClassificationKind, MoveRecord, PendingCombat, Piece, PlayerSide, Position } from "../types";
import {
  FirestoreGameState,
  FirestoreMoveHistoryEntry,
  FirestorePendingCombat,
  FirestorePiece,
  FirestorePlayerCardState,
  OnlineGameDocument,
  OnlineGameViewDocument,
} from "./onlineTypes";

export function serializeGameStateForFirestore(gameState: GameState): FirestoreGameState {
  const moveHistory = gameState.moveHistory.map(serializeMoveRecordForFirestore);

  return {
    turn: gameState.turn,
    turnNumber: gameState.turnNumber,
    selectedFactions: {
      Blue: gameState.selectedFactions.Blue,
      Red: gameState.selectedFactions.Red,
    },
    cards: {
      Blue: serializePlayerCardsForFirestore(gameState.cards.Blue),
      Red: serializePlayerCardsForFirestore(gameState.cards.Red),
    },
    drawState: {
      Blue: { ...gameState.drawState.Blue },
      Red: { ...gameState.drawState.Red },
    },
    turnActions: {
      Blue: { ...gameState.turnActions.Blue },
      Red: { ...gameState.turnActions.Red },
    },
    activeMoveCard: gameState.activeMoveCard ?? null,
    selectedPieceId: gameState.selectedPieceId ?? null,
    pieces: Object.values(gameState.pieces)
      .map((piece) => serializePiece(gameState, piece))
      .filter((piece): piece is FirestorePiece => Boolean(piece)),
    log: [...gameState.log],
    moveHistory,
    lastMove: gameState.lastMove ? serializeMoveRecordForFirestore(gameState.lastMove) : null,
    forcedDice: gameState.forcedDice
      ? {
          attackerRollIndex: gameState.forcedDice.attackerRollIndex ?? null,
          defenderRollIndex: gameState.forcedDice.defenderRollIndex ?? null,
          attackerValue: gameState.forcedDice.attackerValue ?? null,
          defenderValue: gameState.forcedDice.defenderValue ?? null,
          attackerModifiers: gameState.forcedDice.attackerModifiers ?? [],
          defenderModifiers: gameState.forcedDice.defenderModifiers ?? [],
        }
      : null,
    winner: gameState.winner ?? null,
  };
}

export function deserializeGameStateFromFirestore(data: FirestoreGameState): GameState {
  let board = createEmptyBoard();
  const pieces: GameState["pieces"] = {};

  data.pieces.forEach((entry) => {
    if (entry.captured) {
      return;
    }
    pieces[entry.id] = {
      id: entry.id,
      side: entry.side,
      type: entry.type,
      promoted: entry.promoted || undefined,
    };
    board = setPieceAt(board, squareToPosition(entry.square), entry.id);
  });

  const moveHistory = data.moveHistory.map(deserializeMoveRecordFromFirestore);
  const selectedFactions = normalizeSelectedFactions(data.selectedFactions);
  const normalizedCards = normalizeCardState(
    selectedFactions,
    data.cards
      ? {
          Blue: deserializePlayerCardsFromFirestore(data.cards.Blue),
          Red: deserializePlayerCardsFromFirestore(data.cards.Red),
        }
      : undefined,
    data.drawState ?? undefined,
    data.turnActions ?? undefined,
  );

  return {
    board,
    pieces,
    turn: data.turn,
    turnNumber: data.turnNumber,
    selectedFactions,
    cards: normalizedCards.cards,
    drawState: normalizedCards.drawState,
    turnActions: normalizedCards.turnActions,
    activeMoveCard: data.activeMoveCard ?? undefined,
    selectedPieceId: data.selectedPieceId ?? undefined,
    log: data.log ?? [],
    moveHistory,
    lastMove: data.lastMove ? deserializeMoveRecordFromFirestore(data.lastMove) : moveHistory[0],
    forcedDice: data.forcedDice
      ? {
          attackerRollIndex: data.forcedDice.attackerRollIndex ?? undefined,
          defenderRollIndex: data.forcedDice.defenderRollIndex ?? undefined,
          attackerValue: data.forcedDice.attackerValue ?? undefined,
          defenderValue: data.forcedDice.defenderValue ?? undefined,
          attackerModifiers: data.forcedDice.attackerModifiers ?? [],
          defenderModifiers: data.forcedDice.defenderModifiers ?? [],
        }
      : undefined,
    winner: data.winner ?? undefined,
  };
}

function normalizeSelectedFactions(selectedFactions: FirestoreGameState["selectedFactions"]): GameState["selectedFactions"] {
  return {
    Blue: selectedFactions?.Blue ?? DEFAULT_SELECTED_FACTIONS.Blue,
    Red: selectedFactions?.Red ?? DEFAULT_SELECTED_FACTIONS.Red,
  };
}

function serializePlayerCardsForFirestore(cards: GameState["cards"][PlayerSide]): FirestorePlayerCardState {
  return {
    deckInstanceIds: cards.deck.map((card) => card.id),
    handInstanceIds: cards.hand.map((card) => card.id),
    discardInstanceIds: cards.discard.map((card) => card.id),
    handLimit: cards.handLimit,
  };
}

function deserializePlayerCardsFromFirestore(cards: FirestorePlayerCardState): GameState["cards"][PlayerSide] {
  const deckIds = cards.deckInstanceIds ?? cards.deckIds ?? [];
  const handIds = cards.handInstanceIds ?? cards.handIds ?? [];
  const discardIds = cards.discardInstanceIds ?? cards.discardIds ?? [];
  return {
    deck: deckIds.map(getCardById).filter((card): card is NonNullable<typeof card> => Boolean(card)),
    hand: handIds.map(getCardById).filter((card): card is NonNullable<typeof card> => Boolean(card)),
    discard: discardIds.map(getCardById).filter((card): card is NonNullable<typeof card> => Boolean(card)),
    handLimit: cards.handLimit ?? DEFAULT_HAND_LIMIT,
  };
}

export function serializeOnlineGameForFirestore(game: Omit<OnlineGameDocument, "gameState" | "moveHistory" | "pendingCombat"> & {
  gameState: GameState;
  pendingCombat?: PendingCombat | null;
}): OnlineGameDocument {
  const gameState = serializeGameStateForFirestore(game.gameState);
  return {
    ...game,
    gameState,
    moveHistory: gameState.moveHistory,
    pendingCombat: game.pendingCombat ? serializePendingCombatForFirestore(game.pendingCombat) : null,
  };
}

export function deserializeOnlineGameFromFirestore(game: OnlineGameDocument): OnlineGameViewDocument {
  const gameState = deserializeGameStateFromFirestore(game.gameState);
  return {
    ...game,
    gameVersion: game.gameVersion ?? "core",
    gameState,
    moveHistory: gameState.moveHistory,
    pendingCombat: game.pendingCombat ? deserializePendingCombatFromFirestore(game.pendingCombat) : null,
  };
}

export function hasNestedArray(value: unknown): boolean {
  return findNestedArrayPath(value) !== null;
}

export function findNestedArrayPath(value: unknown): string | null {
  return findNestedArrayPathInner(value, "$", false);
}

export function assertNoNestedArrays(value: unknown, label: string): void {
  const path = findNestedArrayPath(value);
  if (path) {
    console.error(`${label} contains a nested array at ${path}. Firestore cannot save nested arrays.`);
  }
}

function serializePiece(gameState: GameState, piece: Piece): FirestorePiece | null {
  const position = getPiecePosition(gameState.board, piece.id);
  if (!position) {
    return null;
  }

  return {
    id: piece.id,
    type: piece.type,
    side: piece.side,
    square: coordinateLabel(position),
    promoted: piece.promoted || undefined,
  };
}

function serializeMoveRecordForFirestore(record: MoveRecord): FirestoreMoveHistoryEntry {
  return {
    turnNumber: record.turnNumber,
    player: record.player,
    actor: record.actor,
    pieceId: record.attacker.id,
    pieceType: record.attacker.type,
    from: coordinateLabel(record.move.from),
    to: coordinateLabel(record.move.to),
    moveKind: getMoveKind(record),
    text: record.text,
    capturedPieceId: record.removedPiece?.id ?? record.capturedPieceId ?? null,
    capturedPieceType: record.removedPiece?.type ?? null,
    capturedPieceSide: record.removedPiece?.side ?? null,
    targetPieceId: record.defender?.id ?? null,
    targetPieceType: record.defender?.type ?? null,
    targetPieceSide: record.defender?.side ?? null,
    combatAttackerValue: record.combat?.attackerValue ?? null,
    combatDefenderValue: record.combat?.defenderValue ?? null,
    combatAttackerBaseValue: record.combat?.attackerBaseValue ?? record.combat?.attackerValue ?? null,
    combatDefenderBaseValue: record.combat?.defenderBaseValue ?? record.combat?.defenderValue ?? null,
    combatAttackerOriginalRollIndex: record.combat?.attackerOriginalRollIndex ?? null,
    combatDefenderOriginalRollIndex: record.combat?.defenderOriginalRollIndex ?? null,
    combatAttackerOriginalBaseValue: record.combat?.attackerOriginalBaseValue ?? null,
    combatDefenderOriginalBaseValue: record.combat?.defenderOriginalBaseValue ?? null,
    combatAttackerFinalValue: record.combat?.attackerFinalValue ?? record.combat?.attackerValue ?? null,
    combatDefenderFinalValue: record.combat?.defenderFinalValue ?? record.combat?.defenderValue ?? null,
    combatAttackerModifiers: record.combat?.attackerModifiers ?? [],
    combatDefenderModifiers: record.combat?.defenderModifiers ?? [],
    combatWinner: record.combat?.winner ?? null,
    combatAttackerWon: record.combat?.attackerWon ?? null,
    combatManualRoll: record.combat?.manualRoll ?? null,
    combatAttackerAutoRolled: record.combat?.attackerAutoRolled ?? null,
    combatDefenderAutoRolled: record.combat?.defenderAutoRolled ?? null,
    combatAttackerUsedGambit: record.combat?.attackerUsedGambit ?? null,
    combatDefenderUsedGambit: record.combat?.defenderUsedGambit ?? null,
    promotedPieceId: record.promotedPiece?.id ?? null,
    promotionProfileName: record.promotionProfileName ?? null,
    cannonScreenSquares: record.cannon?.screenSquares.map(coordinateLabel) ?? [],
    cannonStartsInHomeTerritory: record.cannon?.startsInHomeTerritory ?? null,
    checkedSides: record.checkedSides ?? [],
  };
}

export function serializePendingCombatForFirestore(pendingCombat: PendingCombat): FirestorePendingCombat {
  return {
    combatId: pendingCombat.combatId,
    attackerPieceId: pendingCombat.attackerPieceId,
    defenderPieceId: pendingCombat.defenderPieceId,
    attackerSide: pendingCombat.attackerSide,
    defenderSide: pendingCombat.defenderSide,
    attackerSquare: coordinateLabel(pendingCombat.attackerSquare),
    defenderSquare: coordinateLabel(pendingCombat.defenderSquare),
    targetSquare: coordinateLabel(pendingCombat.targetSquare),
    attackerProfileName: pendingCombat.attackerProfileName,
    defenderProfileName: pendingCombat.defenderProfileName,
    attackerProfile: pendingCombat.attackerProfile,
    defenderProfile: pendingCombat.defenderProfile,
    attackerDieIndex: pendingCombat.attackerDieIndex ?? null,
    defenderDieIndex: pendingCombat.defenderDieIndex ?? null,
    attackerOriginalDieIndex: pendingCombat.attackerOriginalDieIndex ?? null,
    defenderOriginalDieIndex: pendingCombat.defenderOriginalDieIndex ?? null,
    attackerProfileValue: pendingCombat.attackerProfileValue ?? null,
    defenderProfileValue: pendingCombat.defenderProfileValue ?? null,
    attackerOriginalProfileValue: pendingCombat.attackerOriginalProfileValue ?? null,
    defenderOriginalProfileValue: pendingCombat.defenderOriginalProfileValue ?? null,
    attackerFinalValue: pendingCombat.attackerFinalValue ?? null,
    defenderFinalValue: pendingCombat.defenderFinalValue ?? null,
    attackerModifiers: pendingCombat.attackerModifiers ?? [],
    defenderModifiers: pendingCombat.defenderModifiers ?? [],
    attackerAutoRolled: pendingCombat.attackerAutoRolled ?? null,
    defenderAutoRolled: pendingCombat.defenderAutoRolled ?? null,
    attackerUsedGambit: pendingCombat.attackerUsedGambit ?? null,
    defenderUsedGambit: pendingCombat.defenderUsedGambit ?? null,
    attackerPassedGambit: pendingCombat.attackerPassedGambit ?? null,
    defenderPassedGambit: pendingCombat.defenderPassedGambit ?? null,
    attackerPlayedCardIds: pendingCombat.attackerPlayedCardIds ?? [],
    defenderPlayedCardIds: pendingCombat.defenderPlayedCardIds ?? [],
    breakthroughState: pendingCombat.breakthroughState ?? null,
    crownbreakerState: pendingCombat.crownbreakerState ?? null,
    gambitWindowStartedAt: pendingCombat.gambitWindowStartedAt ?? null,
    gambitWindowDeadlineAt: pendingCombat.gambitWindowDeadlineAt ?? null,
    resultRevealedAt: pendingCombat.resultRevealedAt ?? null,
    resolveAfterAt: pendingCombat.resolveAfterAt ?? null,
    winnerSide: pendingCombat.winnerSide ?? null,
    attackerWins: pendingCombat.attackerWins ?? null,
    isTie: pendingCombat.isTie ?? null,
    startedAt: pendingCombat.startedAt,
    rollDeadlineAt: pendingCombat.rollDeadlineAt,
    status: pendingCombat.status,
  };
}

export function deserializePendingCombatFromFirestore(entry: FirestorePendingCombat): PendingCombat {
  return {
    combatId: entry.combatId,
    attackerPieceId: entry.attackerPieceId,
    defenderPieceId: entry.defenderPieceId,
    attackerSide: entry.attackerSide,
    defenderSide: entry.defenderSide,
    attackerSquare: squareToPosition(entry.attackerSquare),
    defenderSquare: squareToPosition(entry.defenderSquare),
    targetSquare: squareToPosition(entry.targetSquare),
    attackerProfileName: entry.attackerProfileName,
    defenderProfileName: entry.defenderProfileName,
    attackerProfile: entry.attackerProfile,
    defenderProfile: entry.defenderProfile,
    attackerDieIndex: entry.attackerDieIndex ?? undefined,
    defenderDieIndex: entry.defenderDieIndex ?? undefined,
    attackerOriginalDieIndex: entry.attackerOriginalDieIndex ?? undefined,
    defenderOriginalDieIndex: entry.defenderOriginalDieIndex ?? undefined,
    attackerProfileValue: entry.attackerProfileValue ?? undefined,
    defenderProfileValue: entry.defenderProfileValue ?? undefined,
    attackerOriginalProfileValue: entry.attackerOriginalProfileValue ?? undefined,
    defenderOriginalProfileValue: entry.defenderOriginalProfileValue ?? undefined,
    attackerFinalValue: entry.attackerFinalValue ?? undefined,
    defenderFinalValue: entry.defenderFinalValue ?? undefined,
    attackerModifiers: entry.attackerModifiers ?? [],
    defenderModifiers: entry.defenderModifiers ?? [],
    attackerAutoRolled: entry.attackerAutoRolled ?? undefined,
    defenderAutoRolled: entry.defenderAutoRolled ?? undefined,
    attackerUsedGambit: entry.attackerUsedGambit ?? undefined,
    defenderUsedGambit: entry.defenderUsedGambit ?? undefined,
    attackerPassedGambit: entry.attackerPassedGambit ?? undefined,
    defenderPassedGambit: entry.defenderPassedGambit ?? undefined,
    attackerPlayedCardIds: entry.attackerPlayedCardIds ?? [],
    defenderPlayedCardIds: entry.defenderPlayedCardIds ?? [],
    breakthroughState: entry.breakthroughState ?? undefined,
    crownbreakerState: entry.crownbreakerState ?? undefined,
    gambitWindowStartedAt: entry.gambitWindowStartedAt ?? undefined,
    gambitWindowDeadlineAt: entry.gambitWindowDeadlineAt ?? undefined,
    resultRevealedAt: entry.resultRevealedAt ?? undefined,
    resolveAfterAt: entry.resolveAfterAt ?? undefined,
    winnerSide: entry.winnerSide ?? undefined,
    attackerWins: entry.attackerWins ?? undefined,
    isTie: entry.isTie ?? undefined,
    startedAt: entry.startedAt,
    rollDeadlineAt: entry.rollDeadlineAt,
    status: entry.status,
  };
}

function deserializeMoveRecordFromFirestore(entry: FirestoreMoveHistoryEntry): MoveRecord {
  const attacker: Piece = {
    id: entry.pieceId,
    side: entry.player,
    type: entry.pieceType,
  };
  const defender: Piece | undefined = entry.targetPieceId && entry.targetPieceSide && entry.targetPieceType
    ? {
        id: entry.targetPieceId,
        side: entry.targetPieceSide,
        type: entry.targetPieceType,
      }
    : undefined;
  const removedPiece: Piece | undefined = entry.capturedPieceId && entry.capturedPieceSide && entry.capturedPieceType
    ? {
        id: entry.capturedPieceId,
        side: entry.capturedPieceSide,
        type: entry.capturedPieceType,
      }
    : undefined;
  const from = squareToPosition(entry.from);
  const to = squareToPosition(entry.to);
  const combat = entry.moveKind === "combatCapture" && defender && entry.combatWinner
    ? {
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerType: attacker.type,
        defenderType: defender.type,
        attackerRollIndex: 0,
        defenderRollIndex: 0,
        attackerOriginalRollIndex: entry.combatAttackerOriginalRollIndex ?? undefined,
        defenderOriginalRollIndex: entry.combatDefenderOriginalRollIndex ?? undefined,
        attackerBaseValue: entry.combatAttackerBaseValue ?? entry.combatAttackerValue ?? 0,
        defenderBaseValue: entry.combatDefenderBaseValue ?? entry.combatDefenderValue ?? 0,
        attackerOriginalBaseValue: entry.combatAttackerOriginalBaseValue ?? undefined,
        defenderOriginalBaseValue: entry.combatDefenderOriginalBaseValue ?? undefined,
        attackerModifiers: entry.combatAttackerModifiers ?? [],
        defenderModifiers: entry.combatDefenderModifiers ?? [],
        attackerFinalValue: entry.combatAttackerFinalValue ?? entry.combatAttackerValue ?? 0,
        defenderFinalValue: entry.combatDefenderFinalValue ?? entry.combatDefenderValue ?? 0,
        attackerValue: entry.combatAttackerFinalValue ?? entry.combatAttackerValue ?? 0,
        defenderValue: entry.combatDefenderFinalValue ?? entry.combatDefenderValue ?? 0,
        winner: entry.combatWinner,
        attackerWon: entry.combatAttackerWon ?? entry.combatWinner === attacker.side,
        target: to,
        manualRoll: entry.combatManualRoll || undefined,
        attackerAutoRolled: entry.combatAttackerAutoRolled || undefined,
        defenderAutoRolled: entry.combatDefenderAutoRolled || undefined,
        attackerUsedGambit: entry.combatAttackerUsedGambit || undefined,
        defenderUsedGambit: entry.combatDefenderUsedGambit || undefined,
      }
    : undefined;

  return {
    text: entry.text,
    turnNumber: entry.turnNumber,
    player: entry.player,
    actor: entry.actor,
    attacker,
    defender,
    move: {
      from,
      to,
      kind: entry.moveKind === "normalMove" ? "move" : "capture",
    },
    capturedPieceId: entry.capturedPieceId ?? undefined,
    combat,
    captureType: entry.moveKind === "combatCapture" ? "Combat" : entry.moveKind === "directCapture" ? "Direct" : undefined,
    removedPiece,
    cannon: entry.cannonScreenSquares?.length
      ? {
          screenCount: entry.cannonScreenSquares.length,
          screenSquares: entry.cannonScreenSquares.map(squareToPosition),
          startsInHomeTerritory: Boolean(entry.cannonStartsInHomeTerritory),
          usesCombat: entry.moveKind === "combatCapture",
        }
      : undefined,
    promotedPiece: entry.promotedPieceId
      ? {
          ...attacker,
          id: entry.promotedPieceId,
          promoted: true,
        }
      : undefined,
    promotionProfileName: entry.promotionProfileName ?? undefined,
    checkedSides: entry.checkedSides?.length ? entry.checkedSides : undefined,
  };
}

function getMoveKind(record: MoveRecord): Exclude<MoveClassificationKind, "illegal"> {
  if (record.combat) {
    return "combatCapture";
  }
  if (record.defender) {
    return "directCapture";
  }
  return "normalMove";
}

function squareToPosition(square: string): Position {
  const file = square[0].toUpperCase();
  const col = "ABCDEFG".indexOf(file);
  const row = Number(square.slice(1));
  return { col, row };
}

function findNestedArrayPathInner(value: unknown, path: string, insideArray: boolean): string | null {
  if (Array.isArray(value)) {
    if (insideArray) {
      return path;
    }
    for (let index = 0; index < value.length; index += 1) {
      const entry = value[index];
      if (Array.isArray(entry)) {
        return `${path}[${index}]`;
      }
      const childPath = findNestedArrayPathInner(entry, `${path}[${index}]`, false);
      if (childPath) {
        return childPath;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const childPath = findNestedArrayPathInner(entry, `${path}.${key}`, insideArray);
      if (childPath) {
        return childPath;
      }
    }
  }

  return null;
}
