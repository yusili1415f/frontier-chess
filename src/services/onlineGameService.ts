import { doc, getDoc, onSnapshot, runTransaction, setDoc, Unsubscribe } from "firebase/firestore";
import { getLegalMove } from "../engine/movement";
import { applyMove, createInitialGameState } from "../engine/gameState";
import { annotateLastMove } from "../engine/history";
import { PlayerSide } from "../engine/types";
import {
  autoRollExpiredPendingCombat,
  createPendingCombat,
  pendingCombatToForcedDice,
  rollPendingCombatSide,
} from "../engine/pendingCombat";
import {
  OnlineGameDocument,
  OnlineGameViewDocument,
  OnlineMatchResult,
  OnlineMoveInput,
  OnlinePlayerRole,
  OnlineRematchSideMode,
} from "../engine/online/onlineTypes";
import {
  assertNoNestedArrays,
  deserializeOnlineGameFromFirestore,
  serializePendingCombatForFirestore,
  serializeOnlineGameForFirestore,
  serializeGameStateForFirestore,
} from "../engine/online/firestoreSerialization";
import { firebaseConfigured, requireFirestore } from "./firebase";
import { APP_GAME_VERSION } from "../appVersion";

const PLAYER_ID_KEY = "frontierChessPlayerId";
const GAME_COLLECTION = "games";

export function isOnlineConfigured(): boolean {
  return firebaseConfigured;
}

export function getOrCreatePlayerId(): string {
  const existing = window.localStorage.getItem(PLAYER_ID_KEY);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  window.localStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

export async function createOnlineGame(playerId: string): Promise<string> {
  const gameId = createRoomCode();
  const now = Date.now();
  const game = serializeOnlineGameForFirestore({
    gameId,
    gameVersion: APP_GAME_VERSION,
    createdAt: now,
    updatedAt: now,
    status: "waiting",
    currentPlayer: "Blue",
    bluePlayerId: playerId,
    gameState: createInitialGameState(),
    matchNumber: 1,
    rematch: createEmptyRematchState(),
    previousResults: [],
    winner: null,
    reason: null,
  });

  assertNoNestedArraysInDevelopment(game, "createOnlineGame");
  await setDoc(doc(requireFirestore(), GAME_COLLECTION, gameId), sanitizeForFirestore(game));
  return gameId;
}

export async function joinOnlineGame(gameId: string, playerId: string): Promise<OnlinePlayerRole> {
  const normalizedGameId = normalizeGameId(gameId);
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizedGameId);

  return runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error(`Online game ${normalizedGameId} was not found.`);
    }

    const game = snapshot.data() as OnlineGameDocument;
    const now = Date.now();

    if (game.bluePlayerId === playerId) {
      return "Blue";
    }
    if (game.redPlayerId === playerId) {
      return "Red";
    }
    if (!game.redPlayerId) {
      transaction.update(ref, sanitizeForFirestoreRecord({ redPlayerId: playerId, status: "active", updatedAt: now }));
      return "Red";
    }
    if (!game.bluePlayerId) {
      transaction.update(ref, sanitizeForFirestoreRecord({ bluePlayerId: playerId, updatedAt: now }));
      return "Blue";
    }

    return "Spectator";
  });
}

export function subscribeToOnlineGame(
  gameId: string,
  callback: (game: OnlineGameViewDocument | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId)),
    (snapshot) => {
      callback(snapshot.exists() ? deserializeOnlineGameFromFirestore(snapshot.data() as OnlineGameDocument) : null);
    },
    (error) => onError?.(error),
  );
}

export async function submitOnlineMove(gameId: string, playerId: string, moveInput: OnlineMoveInput): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));

  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }

    const storedGame = snapshot.data() as OnlineGameDocument;
    if (storedGame.status !== "active") {
      throw new Error("This online game is not active.");
    }
    if (storedGame.pendingCombat) {
      throw new Error("Combat is pending. Roll dice before making another move.");
    }
    const game = deserializeOnlineGameFromFirestore(storedGame);

    const side = game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);

    const legalMove = getLegalMove(game.gameState, moveInput.pieceId, moveInput.to);
    if (!legalMove) {
      throw new Error("That move is not legal in the latest online game state.");
    }

    const before = game.gameState;
    const attacker = before.pieces[moveInput.pieceId];
    const defenderId = before.board[moveInput.to.row - 1]?.[moveInput.to.col]?.pieceId;
    const defender = defenderId ? before.pieces[defenderId] : undefined;

    if (moveInput.combatRollMode === "manual" && legalMove.classification?.kind === "combatCapture" && attacker && defender) {
      const pendingCombat = createPendingCombat(before, legalMove, attacker, defender);
      const serializedState = serializeGameStateForFirestore({ ...before, selectedPieceId: undefined });
      const nextGame: Partial<OnlineGameDocument> = {
        updatedAt: Date.now(),
        currentPlayer: before.turn,
        gameState: serializedState,
        moveHistory: serializedState.moveHistory,
        pendingCombat: serializePendingCombatForFirestore(pendingCombat),
      };

      assertNoNestedArraysInDevelopment(nextGame, "submitOnlineMove.pendingCombat");
      transaction.update(ref, sanitizeForFirestoreRecord(nextGame));
      return;
    }

    const applied = applyMove(before, moveInput.pieceId, legalMove);
    if (applied === before || !applied.lastMove) {
      throw new Error("Move could not be applied.");
    }

    const nextState = annotateLastMove(applied, "Human");
    const status = nextState.winner ? "finished" : "active";
    const reason = nextState.winner ? "kingCaptured" : null;
    const serializedState = serializeGameStateForFirestore(nextState);
    const nextGame: Partial<OnlineGameDocument> = {
      updatedAt: Date.now(),
      status,
      currentPlayer: nextState.turn,
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
      winner: nextState.winner ?? null,
      reason,
      pendingCombat: null,
    };

    assertNoNestedArraysInDevelopment(nextGame, "submitOnlineMove");
    transaction.update(ref, sanitizeForFirestoreRecord(nextGame));
  });
}

export async function submitOnlineCombatRoll(gameId: string, playerId: string, side: PlayerSide): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));

  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }

    const storedGame = snapshot.data() as OnlineGameDocument;
    if (storedGame.status !== "active" || !storedGame.pendingCombat) {
      throw new Error("There is no pending combat to roll.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);

    const game = deserializeOnlineGameFromFirestore(storedGame);
    const pendingCombat = game.pendingCombat;
    if (!pendingCombat) {
      throw new Error("There is no pending combat to roll.");
    }
    if (side !== pendingCombat.attackerSide && side !== pendingCombat.defenderSide) {
      throw new Error("This side is not part of the pending combat.");
    }

    const rolled = rollPendingCombatSide(pendingCombat, side);
    transaction.update(ref, sanitizeForFirestoreRecord(resolveOrStorePendingCombat(storedGame, rolled)));
  });
}

export async function autoRollExpiredOnlineCombat(gameId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));

  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      return;
    }

    const storedGame = snapshot.data() as OnlineGameDocument;
    if (storedGame.status !== "active" || !storedGame.pendingCombat) {
      return;
    }

    const game = deserializeOnlineGameFromFirestore(storedGame);
    const pendingCombat = game.pendingCombat;
    if (!pendingCombat || Date.now() < pendingCombat.rollDeadlineAt) {
      return;
    }

    const rolled = autoRollExpiredPendingCombat(pendingCombat);
    transaction.update(ref, sanitizeForFirestoreRecord(resolveOrStorePendingCombat(storedGame, rolled)));
  });
}

export async function requestOnlineRematch(
  gameId: string,
  playerId: string,
  sideMode: OnlineRematchSideMode = "same",
): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));

  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }

    const game = snapshot.data() as OnlineGameDocument;
    if (game.status !== "finished") {
      throw new Error("Rematch is only available after the online game is finished.");
    }

    const side = getPlayerSide(game, playerId);
    if (!side) {
      throw new Error("Spectators cannot request rematch.");
    }

    const rematch = {
      requestedByBlue: game.rematch?.requestedByBlue ?? false,
      requestedByRed: game.rematch?.requestedByRed ?? false,
      requestedAt: Date.now(),
      sideMode: game.rematch?.requestedByBlue || game.rematch?.requestedByRed ? game.rematch?.sideMode ?? sideMode : sideMode,
    };

    if (side === "Blue") {
      rematch.requestedByBlue = true;
    } else {
      rematch.requestedByRed = true;
    }

    const update = startOnlineRematchIfBothAccepted({
      ...game,
      rematch,
    });

    assertNoNestedArraysInDevelopment(update, "requestOnlineRematch");
    transaction.update(ref, sanitizeForFirestoreRecord(update));
  });
}

export async function cancelOnlineRematchRequest(gameId: string, playerId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));

  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }

    const game = snapshot.data() as OnlineGameDocument;
    const side = getPlayerSide(game, playerId);
    if (!side) {
      throw new Error("Spectators cannot cancel rematch requests.");
    }

    const rematch = {
      requestedByBlue: game.rematch?.requestedByBlue ?? false,
      requestedByRed: game.rematch?.requestedByRed ?? false,
      requestedAt: game.rematch?.requestedAt ?? null,
      sideMode: game.rematch?.sideMode ?? "same",
    };

    if (side === "Blue") {
      rematch.requestedByBlue = false;
    } else {
      rematch.requestedByRed = false;
    }

    transaction.update(ref, sanitizeForFirestoreRecord({ rematch, updatedAt: Date.now() }));
  });
}

export function startOnlineRematchIfBothAccepted(game: OnlineGameDocument): Partial<OnlineGameDocument> {
  const rematch = game.rematch ?? createEmptyRematchState();
  if (!rematch.requestedByBlue || !rematch.requestedByRed) {
    return {
      rematch,
      updatedAt: Date.now(),
    };
  }

  const nextMatchNumber = (game.matchNumber ?? 1) + 1;
  const freshState = createInitialGameState();
  const serializedState = serializeGameStateForFirestore({
    ...freshState,
    log: [`Match ${nextMatchNumber} started in the same room.`, ...freshState.log],
  });
  const shouldSwap = rematch.sideMode === "swap";
  const previousResults = [...(game.previousResults ?? []), createMatchResult(game)];

  return {
    updatedAt: Date.now(),
    status: "active",
    gameVersion: game.gameVersion ?? APP_GAME_VERSION,
    currentPlayer: "Blue",
    bluePlayerId: shouldSwap ? game.redPlayerId : game.bluePlayerId,
    redPlayerId: shouldSwap ? game.bluePlayerId : game.redPlayerId,
    gameState: serializedState,
    moveHistory: [],
    matchNumber: nextMatchNumber,
    previousResults,
    winner: null,
    reason: null,
    rematch: createEmptyRematchState(),
  };
}

export async function getOnlineGame(gameId: string): Promise<OnlineGameViewDocument | null> {
  const snapshot = await getDoc(doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId)));
  return snapshot.exists() ? deserializeOnlineGameFromFirestore(snapshot.data() as OnlineGameDocument) : null;
}

export function normalizeGameId(gameId: string): string {
  return gameId.trim().toUpperCase();
}

function assertPlayerOwnsTurn(
  game: Pick<OnlineGameDocument, "bluePlayerId" | "redPlayerId">,
  playerId: string,
  side: PlayerSide,
): void {
  if (side === "Blue" && game.bluePlayerId !== playerId) {
    throw new Error("It is Blue's turn, but this browser does not own Blue.");
  }
  if (side === "Red" && game.redPlayerId !== playerId) {
    throw new Error("It is Red's turn, but this browser does not own Red.");
  }
}

function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function getPlayerSide(game: Pick<OnlineGameDocument, "bluePlayerId" | "redPlayerId">, playerId: string): PlayerSide | null {
  if (game.bluePlayerId === playerId) {
    return "Blue";
  }
  if (game.redPlayerId === playerId) {
    return "Red";
  }
  return null;
}

function createEmptyRematchState() {
  return {
    requestedByBlue: false,
    requestedByRed: false,
    requestedAt: null,
    sideMode: "same" as const,
  };
}

function createMatchResult(game: OnlineGameDocument): OnlineMatchResult {
  return {
    matchNumber: game.matchNumber ?? 1,
    winner: game.winner ?? null,
    reason: game.reason ?? null,
    totalTurns: Math.max(0, (game.gameState?.turnNumber ?? 1) - 1),
    finishedAt: Date.now(),
  };
}

function resolveOrStorePendingCombat(storedGame: OnlineGameDocument, pendingCombat: NonNullable<OnlineGameViewDocument["pendingCombat"]>): Partial<OnlineGameDocument> {
  if (pendingCombat.status !== "revealingResult" || Date.now() < (pendingCombat.resolveAfterAt ?? Number.POSITIVE_INFINITY)) {
    return {
      updatedAt: Date.now(),
      pendingCombat: serializePendingCombatForFirestore(pendingCombat),
    };
  }

  const game = deserializeOnlineGameFromFirestore(storedGame);
  const legalMove = getLegalMove(game.gameState, pendingCombat.attackerPieceId, pendingCombat.targetSquare);
  if (!legalMove) {
    throw new Error("Pending combat can no longer be resolved because the move is no longer legal.");
  }

  const nextState = annotateLastMove(
    {
      ...applyMove(
        {
          ...game.gameState,
          forcedDice: {
            ...game.gameState.forcedDice,
            ...pendingCombatToForcedDice(pendingCombat),
            manualRoll: true,
          },
        },
        pendingCombat.attackerPieceId,
        legalMove,
      ),
      forcedDice: game.gameState.forcedDice,
    },
    "Human",
  );
  const status = nextState.winner ? "finished" : "active";
  const reason = nextState.winner ? "kingCaptured" : null;
  const serializedState = serializeGameStateForFirestore(nextState);

  return {
    updatedAt: Date.now(),
    status,
    currentPlayer: nextState.turn,
    gameState: serializedState,
    moveHistory: serializedState.moveHistory,
    pendingCombat: null,
    winner: nextState.winner ?? null,
    reason,
  };
}

function sanitizeForFirestore(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFirestore);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, sanitizeForFirestore(entry)]),
    );
  }

  return value;
}

function sanitizeForFirestoreRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeForFirestore(value) as Record<string, unknown>;
}

function assertNoNestedArraysInDevelopment(value: unknown, label: string): void {
  if (import.meta.env.DEV) {
    assertNoNestedArrays(value, label);
  }
}
