import { coordinateLabel, createEmptyBoard, getPiecePosition, setPieceAt } from "../board";
import { GameState, MoveClassificationKind, MoveRecord, Piece, PlayerSide, Position } from "../types";
import { FirestoreGameState, FirestoreMoveHistoryEntry, FirestorePiece, OnlineGameDocument, OnlineGameViewDocument } from "./onlineTypes";

export function serializeGameStateForFirestore(gameState: GameState): FirestoreGameState {
  const moveHistory = gameState.moveHistory.map(serializeMoveRecordForFirestore);

  return {
    turn: gameState.turn,
    turnNumber: gameState.turnNumber,
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

  return {
    board,
    pieces,
    turn: data.turn,
    turnNumber: data.turnNumber,
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
        }
      : undefined,
    winner: data.winner ?? undefined,
  };
}

export function serializeOnlineGameForFirestore(game: Omit<OnlineGameDocument, "gameState" | "moveHistory"> & {
  gameState: GameState;
}): OnlineGameDocument {
  const gameState = serializeGameStateForFirestore(game.gameState);
  return {
    ...game,
    gameState,
    moveHistory: gameState.moveHistory,
  };
}

export function deserializeOnlineGameFromFirestore(game: OnlineGameDocument): OnlineGameViewDocument {
  const gameState = deserializeGameStateFromFirestore(game.gameState);
  return {
    ...game,
    gameState,
    moveHistory: gameState.moveHistory,
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
    combatWinner: record.combat?.winner ?? null,
    combatAttackerWon: record.combat?.attackerWon ?? null,
    promotedPieceId: record.promotedPiece?.id ?? null,
    promotionProfileName: record.promotionProfileName ?? null,
    cannonScreenSquares: record.cannon?.screenSquares.map(coordinateLabel) ?? [],
    cannonStartsInHomeTerritory: record.cannon?.startsInHomeTerritory ?? null,
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
        attackerValue: entry.combatAttackerValue ?? 0,
        defenderValue: entry.combatDefenderValue ?? 0,
        winner: entry.combatWinner,
        attackerWon: entry.combatAttackerWon ?? entry.combatWinner === attacker.side,
        target: to,
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
