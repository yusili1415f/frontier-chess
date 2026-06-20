import { doc, getDoc, onSnapshot, runTransaction, setDoc, Unsubscribe } from "firebase/firestore";
import { getLegalMove } from "../engine/movement";
import { applyAdvanceMove, applyBannerDrillMove, applyBoneRevivalPlacement, applyCrownbreakerPostCombatMove, applyIronCrownActiveMove, applyMove, applySmokeBombEscape, createInitialGameState, getCrownbreakerPostCombatMoves, getIronCrownActiveMoves, selectBoneRevivalPiece, skipBannerDrillCannonMove, skipCrownbreakerPostCombatMove } from "../engine/gameState";
import { annotateLastMove } from "../engine/history";
import { GameState, PlayerSide, Position, SelectedFactions } from "../engine/types";
import { cancelActiveMoveCard, createDefaultCards, createDefaultDrawState, createDefaultTurnActions, moveCardFromHandToDiscard, playCard, voluntaryDiscardCards } from "../engine/cards/cardEngine";
import {
  autoRollExpiredPendingCombat,
  attachBreakthroughCharge,
  attachCrownbreakerCharge,
  cancelBoneSacrificeSelection,
  chooseBoneSacrificePawn,
  chooseSmokeBombEscape,
  declineBreakthroughChargeReroll,
  canSideUseGambit,
  canPlayBeforeCombatCard,
  createPendingCombat,
  passLastStrike,
  passPendingCombatGambit,
  passSmokeBomb,
  pendingCombatToForcedDice,
  playLastStrike,
  playBeforeCombatCard,
  playPendingCombatGambit,
  rollPendingCombatSide,
  useBreakthroughChargeReroll,
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

export async function createOnlineGame(playerId: string, selectedFactions?: SelectedFactions): Promise<string> {
  const gameId = createRoomCode();
  const now = Date.now();
  const initialState = createInitialGameState();
  const roomSelectedFactions = selectedFactions ? { ...selectedFactions } : initialState.selectedFactions;
  const game = serializeOnlineGameForFirestore({
    gameId,
    gameVersion: APP_GAME_VERSION,
    createdAt: now,
    updatedAt: now,
    status: "waiting",
    currentPlayer: "Blue",
    bluePlayerId: playerId,
    gameState: {
      ...initialState,
      selectedFactions: roomSelectedFactions,
      cards: createDefaultCards(roomSelectedFactions),
      drawState: createDefaultDrawState(),
      turnActions: createDefaultTurnActions(),
    },
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

    const before = game.gameState;
    const isCardMove = Boolean(before.activeMoveCard);
    const legalMove = getLegalMove(before, moveInput.pieceId, moveInput.to);
    if (!legalMove && !isCardMove) {
      throw new Error("That move is not legal in the latest online game state.");
    }

    const attacker = before.pieces[moveInput.pieceId];
    const defenderId = before.board[moveInput.to.row - 1]?.[moveInput.to.col]?.pieceId;
    const defender = defenderId ? before.pieces[defenderId] : undefined;

    const crownbreakerPostCombat = before.activeMoveCard?.cardName === "Crownbreaker Charge" && before.activeMoveCard.phase === "postCombatMove";
    const boneRevivalPlacement = (before.activeMoveCard?.cardName === "Raise the Fallen" || before.activeMoveCard?.cardName === "Necromancer's Bell") && before.activeMoveCard.phase === "selectHomeSquare";
    const ironCrownCard = (before.activeMoveCard?.cardName === "Breakthrough Charge" || before.activeMoveCard?.cardName === "Crownbreaker Charge") && !crownbreakerPostCombat
      ? before.activeMoveCard
      : undefined;
    const ironCrownLegalMove = ironCrownCard
      ? getIronCrownActiveMoves(before, moveInput.pieceId).find((move) => move.to.col === moveInput.to.col && move.to.row === moveInput.to.row)
      : undefined;
    const pendingLegalMove = ironCrownLegalMove ?? legalMove;

    if (ironCrownCard && !ironCrownLegalMove) {
      throw new Error("That Iron Crown card move is not legal in the latest online game state.");
    }

    const shouldCreatePendingCombat = pendingLegalMove?.classification?.kind === "combatCapture" &&
      attacker &&
      defender &&
      !ironCrownCard &&
      (moveInput.combatRollMode === "manual" || canSakuraReactionMatter(before, defender));

    if (pendingLegalMove && shouldCreatePendingCombat && attacker && defender) {
      const pendingCombat = createPendingCombat(before, pendingLegalMove, attacker, defender);
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

    if (ironCrownCard && pendingLegalMove?.classification?.kind === "combatCapture" && attacker && defender) {
      const beforeState = prepareIronCrownPendingCombatState(before);
      let pendingCombat = createPendingCombat(beforeState, pendingLegalMove, attacker, defender);
      pendingCombat = ironCrownCard.cardName === "Breakthrough Charge"
        ? attachBreakthroughCharge(pendingCombat, ironCrownCard.side, attacker.id, ironCrownCard.cardId)
        : attachCrownbreakerCharge(pendingCombat, ironCrownCard.side, attacker.id, ironCrownCard.cardId);
      const serializedState = serializeGameStateForFirestore({ ...beforeState, selectedPieceId: undefined });
      const nextGame: Partial<OnlineGameDocument> = {
        updatedAt: Date.now(),
        currentPlayer: before.turn,
        gameState: serializedState,
        moveHistory: serializedState.moveHistory,
        pendingCombat: serializePendingCombatForFirestore(pendingCombat),
      };

      assertNoNestedArraysInDevelopment(nextGame, "submitOnlineMove.ironCrownPendingCombat");
      transaction.update(ref, sanitizeForFirestoreRecord(nextGame));
      return;
    }

    const applied = isCardMove
      ? before.activeMoveCard?.cardName === "Banner Drill"
        ? applyBannerDrillMove(before, moveInput.pieceId, moveInput.to)
        : crownbreakerPostCombat
          ? applyCrownbreakerPostCombatMove(before, moveInput.pieceId, moveInput.to)
          : boneRevivalPlacement
            ? applyBoneRevivalPlacement(before, moveInput.to)
          : ironCrownLegalMove
          ? applyIronCrownActiveMove(before, moveInput.pieceId, ironCrownLegalMove)
          : applyAdvanceMove(before, moveInput.pieceId, moveInput.to)
      : legalMove ? applyMove(before, moveInput.pieceId, legalMove) : before;
    if (applied === before || (!applied.lastMove && !isCardMove)) {
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

export async function submitOnlineCardPlay(gameId: string, playerId: string, cardId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const side = game.currentPlayer;
    if (game.pendingCombat) {
      const combatSide = getPlayerSide(game, playerId);
      if (!combatSide) {
        throw new Error("Spectators cannot play combat cards.");
      }
      assertPlayerOwnsTurn(game, playerId, combatSide);
      if (combatSide !== game.pendingCombat.attackerSide && combatSide !== game.pendingCombat.defenderSide) {
        throw new Error("This side is not part of the pending combat.");
      }
      if (!canPlayBeforeCombatCard(game.pendingCombat, game.gameState, combatSide, cardId)) {
        throw new Error("That combat card cannot be played right now.");
      }
      const played = playBeforeCombatCard(game.pendingCombat, game.gameState, combatSide, cardId);
      const serializedState = serializeGameStateForFirestore(played.gameState);
      transaction.update(ref, sanitizeForFirestoreRecord({
        updatedAt: Date.now(),
        gameState: serializedState,
        pendingCombat: serializePendingCombatForFirestore(played.pendingCombat),
      }));
      return;
    }
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = playCard(game.gameState, side, cardId, { timing: "beforeMove" });
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
    }));
  });
}

export async function submitOnlineVoluntaryDiscard(gameId: string, playerId: string, cardIds: string[]): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (storedGame.status !== "active" || storedGame.pendingCombat) {
      throw new Error("Voluntary discard is not available right now.");
    }
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const side = game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = voluntaryDiscardCards(game.gameState, side, cardIds);
    if (nextState === game.gameState) {
      throw new Error("Voluntary discard could not be applied.");
    }
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
    }));
  });
}

export async function cancelOnlineActiveMoveCard(gameId: string, playerId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const side = game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = cancelActiveMoveCard(game.gameState, side);
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({ updatedAt: Date.now(), gameState: serializedState }));
  });
}

export async function submitOnlineSkipBannerDrillCannon(gameId: string, playerId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const side = game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = skipBannerDrillCannonMove(game.gameState, side);
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({ updatedAt: Date.now(), gameState: serializedState }));
  });
}

export async function submitOnlineSkipCrownbreakerPostCombat(gameId: string, playerId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const side = game.gameState.activeMoveCard?.side ?? game.currentPlayer;
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = skipCrownbreakerPostCombatMove(game.gameState, side);
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      currentPlayer: nextState.turn,
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
    }));
  });
}

export async function submitOnlineSelectRemovedPiece(gameId: string, playerId: string, side: PlayerSide, removedPieceId: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    const game = deserializeOnlineGameFromFirestore(storedGame);
    assertPlayerOwnsTurn(game, playerId, side);
    const nextState = selectBoneRevivalPiece(game.gameState, side, removedPieceId);
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
    }));
  });
}

export async function submitOnlineBreakthroughResponse(gameId: string, playerId: string, side: PlayerSide, action: "reroll" | "keep"): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (!storedGame.pendingCombat) {
      throw new Error("There is no pending combat.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const pendingCombat = action === "reroll"
      ? useBreakthroughChargeReroll(game.pendingCombat!, side, game.gameState)
      : declineBreakthroughChargeReroll(game.pendingCombat!, game.gameState);
    transaction.update(ref, sanitizeForFirestoreRecord(resolveOrStorePendingCombat(storedGame, pendingCombat)));
  });
}

export async function submitOnlineBoneSacrificeChoice(gameId: string, playerId: string, side: PlayerSide, pawnPieceId?: string): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (!storedGame.pendingCombat) {
      throw new Error("There is no pending combat.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const result = pawnPieceId
      ? chooseBoneSacrificePawn(game.pendingCombat!, game.gameState, side, pawnPieceId)
      : { pendingCombat: cancelBoneSacrificeSelection(game.pendingCombat!), gameState: game.gameState };
    const serializedState = serializeGameStateForFirestore(result.gameState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      pendingCombat: serializePendingCombatForFirestore(result.pendingCombat),
    }));
  });
}

export async function submitOnlineSmokeBombEscape(gameId: string, playerId: string, side: PlayerSide, escapeSquare?: Position): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (!storedGame.pendingCombat) {
      throw new Error("There is no pending combat.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);
    const game = deserializeOnlineGameFromFirestore(storedGame);
    if (!escapeSquare) {
      const pendingCombat = passSmokeBomb(game.pendingCombat!, game.gameState);
      transaction.update(ref, sanitizeForFirestoreRecord({
        updatedAt: Date.now(),
        pendingCombat: serializePendingCombatForFirestore(pendingCombat),
      }));
      return;
    }
    const pendingCombat = chooseSmokeBombEscape(game.pendingCombat!, side, escapeSquare);
    if (!pendingCombat.smokeBombState?.selectedEscapeSquare) {
      throw new Error("That Smoke Bomb escape square is not legal.");
    }
    const nextState = annotateLastMove(
      applySmokeBombEscape(game.gameState, pendingCombat, pendingCombat.smokeBombState.selectedEscapeSquare),
      "Human",
    );
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      status: nextState.winner ? "finished" : "active",
      currentPlayer: nextState.turn,
      gameState: serializedState,
      moveHistory: serializedState.moveHistory,
      pendingCombat: null,
      winner: nextState.winner ?? null,
      reason: nextState.winner ? "kingCaptured" : null,
    }));
  });
}

export async function submitOnlineLastStrikeResponse(gameId: string, playerId: string, side: PlayerSide, action: "play" | "pass"): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (!storedGame.pendingCombat) {
      throw new Error("There is no pending combat.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);
    const game = deserializeOnlineGameFromFirestore(storedGame);
    const pendingCombat = action === "play"
      ? playLastStrike(game.pendingCombat!, side)
      : passLastStrike(game.pendingCombat!);
    const nextState = action === "play" && game.pendingCombat?.lastStrikeState
      ? moveCardFromHandToDiscard(game.gameState, side, game.pendingCombat.lastStrikeState.cardInstanceId)
      : game.gameState;
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      pendingCombat: serializePendingCombatForFirestore(pendingCombat),
    }));
  });
}

export async function submitOnlineGambitResponse(gameId: string, playerId: string, side: PlayerSide, action: "play" | "pass"): Promise<void> {
  const ref = doc(requireFirestore(), GAME_COLLECTION, normalizeGameId(gameId));
  await runTransaction(requireFirestore(), async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new Error("Online game was not found.");
    }
    const storedGame = snapshot.data() as OnlineGameDocument;
    if (!storedGame.pendingCombat) {
      throw new Error("There is no pending combat.");
    }
    assertPlayerOwnsTurn(storedGame, playerId, side);
    const game = deserializeOnlineGameFromFirestore(storedGame);
    if (action === "play" && !canSideUseGambit(game.pendingCombat!, game.gameState, side)) {
      throw new Error("Gambit cannot be played by this side.");
    }
    const pendingCombat = action === "play"
      ? playPendingCombatGambit(game.pendingCombat!, side, {}, game.gameState)
      : passPendingCombatGambit(game.pendingCombat!, side, game.gameState);
    const nextState = action === "play"
      ? moveCardFromHandToDiscard(game.gameState, side, "basic_gambit")
      : game.gameState;
    const serializedState = serializeGameStateForFirestore(nextState);
    transaction.update(ref, sanitizeForFirestoreRecord({
      updatedAt: Date.now(),
      gameState: serializedState,
      pendingCombat: serializePendingCombatForFirestore(pendingCombat),
    }));
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

    const rolled = rollPendingCombatSide(pendingCombat, side, {}, game.gameState);
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
    const revealReady = pendingCombat?.status === "revealingResult" && Date.now() >= (pendingCombat.resolveAfterAt ?? Number.POSITIVE_INFINITY);
    if (!pendingCombat || (!revealReady && Date.now() < pendingCombat.rollDeadlineAt)) {
      return;
    }

    const rolled = revealReady ? pendingCombat : autoRollExpiredPendingCombat(pendingCombat, Date.now(), game.gameState);
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
  const selectedFactions = game.gameState.selectedFactions ?? freshState.selectedFactions;
  const serializedState = serializeGameStateForFirestore({
    ...freshState,
    selectedFactions,
    cards: createDefaultCards(selectedFactions),
    drawState: createDefaultDrawState(),
    turnActions: createDefaultTurnActions(),
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

  const resolvedState = annotateLastMove(
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
  const nextState = prepareCrownbreakerAfterOnlineCombat(pendingCombat, resolvedState);
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

function prepareIronCrownPendingCombatState(gameState: GameState): GameState {
  const activeCard = gameState.activeMoveCard;
  if (!activeCard) {
    return gameState;
  }
  if (activeCard.cardName === "Breakthrough Charge") {
    const discarded = moveCardFromHandToDiscard(gameState, activeCard.side, activeCard.cardId);
    return {
      ...discarded,
      activeMoveCard: undefined,
      selectedPieceId: undefined,
      log: [`${activeCard.side} Breakthrough Charge movement completed.`, ...discarded.log],
    };
  }
  return {
    ...gameState,
    selectedPieceId: undefined,
    activeMoveCard: {
      ...activeCard,
      phase: "selectDestination",
    },
  };
}

function prepareCrownbreakerAfterOnlineCombat(
  pendingCombat: NonNullable<OnlineGameViewDocument["pendingCombat"]>,
  resolvedState: GameState,
): GameState {
  const crown = pendingCombat.crownbreakerState;
  if (!crown || !resolvedState.activeMoveCard || resolvedState.activeMoveCard.cardName !== "Crownbreaker Charge") {
    return resolvedState;
  }
  const won = pendingCombat.winnerSide === crown.side && Boolean(resolvedState.pieces[crown.knightPieceId]);
  if (!won || resolvedState.winner) {
    return {
      ...moveCardFromHandToDiscard(resolvedState, crown.side, crown.cardInstanceId),
      activeMoveCard: undefined,
      selectedPieceId: undefined,
    };
  }
  const postState = {
    ...resolvedState,
    turn: crown.side,
    activeMoveCard: {
      ...resolvedState.activeMoveCard,
      phase: "postCombatMove" as const,
      selectedPieceId: crown.knightPieceId,
      captureCountThisTurn: 1,
    },
    selectedPieceId: crown.knightPieceId,
    log: [`${crown.side} Knight wins combat. Crownbreaker post-combat move available.`, ...resolvedState.log],
  };
  return getCrownbreakerPostCombatMoves(postState, crown.knightPieceId).length
    ? postState
    : {
        ...moveCardFromHandToDiscard(resolvedState, crown.side, crown.cardInstanceId),
        activeMoveCard: undefined,
        selectedPieceId: undefined,
        log: [`${crown.side} Crownbreaker Charge complete: no adjacent empty square.`, ...resolvedState.log],
      };
}

function canSakuraReactionMatter(gameState: GameState, defender: GameState["pieces"][string]): boolean {
  return gameState.selectedFactions[defender.side] === "sakura_shogunate" &&
    (defender.type === "Bishop" || defender.type === "Guard") &&
    gameState.cards[defender.side].hand.some((card) =>
      card.definitionId === "smoke_bomb" ||
      card.id.startsWith("smoke_bomb") ||
      card.definitionId === "last_strike" ||
      card.id.startsWith("last_strike")
    );
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
