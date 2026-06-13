import { doc, getDoc, onSnapshot, runTransaction, setDoc, Unsubscribe } from "firebase/firestore";
import { getLegalMove } from "../engine/movement";
import { applyMove, createInitialGameState } from "../engine/gameState";
import { annotateLastMove } from "../engine/history";
import { PlayerSide } from "../engine/types";
import { OnlineGameDocument, OnlineGameViewDocument, OnlineMoveInput, OnlinePlayerRole } from "../engine/online/onlineTypes";
import {
  assertNoNestedArrays,
  deserializeOnlineGameFromFirestore,
  serializeOnlineGameForFirestore,
  serializeGameStateForFirestore,
} from "../engine/online/firestoreSerialization";
import { firebaseConfigured, requireFirestore } from "./firebase";

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
    createdAt: now,
    updatedAt: now,
    status: "waiting",
    currentPlayer: "Blue",
    bluePlayerId: playerId,
    gameState: createInitialGameState(),
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
    const game = deserializeOnlineGameFromFirestore(storedGame);

    const side = game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);

    const legalMove = getLegalMove(game.gameState, moveInput.pieceId, moveInput.to);
    if (!legalMove) {
      throw new Error("That move is not legal in the latest online game state.");
    }

    const before = game.gameState;
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
    };

    assertNoNestedArraysInDevelopment(nextGame, "submitOnlineMove");
    transaction.update(ref, sanitizeForFirestoreRecord(nextGame));
  });
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
