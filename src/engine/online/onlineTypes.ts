import { MoveActor } from "../history";
import { ActiveMoveCard, CombatModifier, DrawStateBySide, GameState, LegalMove, MoveRecord, PendingCombat, PieceType, PlayerSide, Position, SelectedFactions } from "../types";

export type OnlineGameStatus = "waiting" | "active" | "finished";
export type OnlineGameVersion = "core" | "faction";
export type OnlinePlayerRole = PlayerSide | "Spectator";
export type OnlineFinishReason = "kingCaptured" | "maxTurns" | "noLegalMoves";
export type OnlineRematchSideMode = "same" | "swap";

export interface OnlineMatchResult {
  matchNumber: number;
  winner: PlayerSide | "Draw" | null;
  reason: OnlineFinishReason | null;
  totalTurns: number;
  finishedAt: number;
}

export interface OnlineRematchState {
  requestedByBlue: boolean;
  requestedByRed: boolean;
  requestedAt?: number | null;
  sideMode?: OnlineRematchSideMode;
}

export type OnlineMoveInput = {
  pieceId: string;
  to: Position;
  combatRollMode?: "automatic" | "manual";
};

export type FirestorePendingCombat = {
  combatId: string;
  attackerPieceId: string;
  defenderPieceId: string;
  attackerSide: PlayerSide;
  defenderSide: PlayerSide;
  attackerSquare: string;
  defenderSquare: string;
  targetSquare: string;
  attackerProfileName: string;
  defenderProfileName: string;
  attackerProfile: number[];
  defenderProfile: number[];
  attackerDieIndex?: number | null;
  defenderDieIndex?: number | null;
  attackerOriginalDieIndex?: number | null;
  defenderOriginalDieIndex?: number | null;
  attackerProfileValue?: number | null;
  defenderProfileValue?: number | null;
  attackerOriginalProfileValue?: number | null;
  defenderOriginalProfileValue?: number | null;
  attackerFinalValue?: number | null;
  defenderFinalValue?: number | null;
  attackerModifiers?: CombatModifier[];
  defenderModifiers?: CombatModifier[];
  attackerAutoRolled?: boolean | null;
  defenderAutoRolled?: boolean | null;
  attackerUsedGambit?: boolean | null;
  defenderUsedGambit?: boolean | null;
  attackerPassedGambit?: boolean | null;
  defenderPassedGambit?: boolean | null;
  gambitWindowStartedAt?: number | null;
  gambitWindowDeadlineAt?: number | null;
  resultRevealedAt?: number | null;
  resolveAfterAt?: number | null;
  winnerSide?: PlayerSide | null;
  attackerWins?: boolean | null;
  isTie?: boolean | null;
  startedAt: number;
  rollDeadlineAt: number;
  status: PendingCombat["status"];
};

export type OnlineMoveHistoryEntry = MoveRecord & {
  actor?: MoveActor;
};

export type FirestorePiece = {
  id: string;
  type: PieceType;
  side: PlayerSide;
  square: string;
  captured?: boolean;
  promoted?: boolean;
};

export type FirestoreMoveHistoryEntry = {
  turnNumber: number;
  player: PlayerSide;
  actor?: MoveActor;
  pieceId: string;
  pieceType: PieceType;
  from: string;
  to: string;
  moveKind: "normalMove" | "directCapture" | "combatCapture";
  text: string;
  capturedPieceId?: string | null;
  capturedPieceType?: PieceType | null;
  capturedPieceSide?: PlayerSide | null;
  targetPieceId?: string | null;
  targetPieceType?: PieceType | null;
  targetPieceSide?: PlayerSide | null;
  combatAttackerValue?: number | null;
  combatDefenderValue?: number | null;
  combatAttackerBaseValue?: number | null;
  combatDefenderBaseValue?: number | null;
  combatAttackerOriginalRollIndex?: number | null;
  combatDefenderOriginalRollIndex?: number | null;
  combatAttackerOriginalBaseValue?: number | null;
  combatDefenderOriginalBaseValue?: number | null;
  combatAttackerFinalValue?: number | null;
  combatDefenderFinalValue?: number | null;
  combatAttackerModifiers?: CombatModifier[];
  combatDefenderModifiers?: CombatModifier[];
  combatWinner?: PlayerSide | null;
  combatAttackerWon?: boolean | null;
  combatManualRoll?: boolean | null;
  combatAttackerAutoRolled?: boolean | null;
  combatDefenderAutoRolled?: boolean | null;
  combatAttackerUsedGambit?: boolean | null;
  combatDefenderUsedGambit?: boolean | null;
  promotedPieceId?: string | null;
  promotionProfileName?: string | null;
  cannonScreenSquares?: string[];
  cannonStartsInHomeTerritory?: boolean | null;
  checkedSides?: PlayerSide[];
};

export interface FirestoreGameState {
  turn: PlayerSide;
  turnNumber: number;
  selectedFactions?: SelectedFactions | null;
  cards?: FirestoreCardStateBySide | null;
  drawState?: DrawStateBySide | null;
  activeMoveCard?: ActiveMoveCard | null;
  selectedPieceId?: string | null;
  pieces: FirestorePiece[];
  log: string[];
  moveHistory: FirestoreMoveHistoryEntry[];
  lastMove?: FirestoreMoveHistoryEntry | null;
  forcedDice?: {
    attackerRollIndex?: number | null;
    defenderRollIndex?: number | null;
    attackerValue?: number | null;
    defenderValue?: number | null;
  } | null;
  winner?: PlayerSide | null;
}

export type FirestorePlayerCardState = {
  deckIds: string[];
  handIds: string[];
  discardIds: string[];
  handLimit: number;
};

export type FirestoreCardStateBySide = Record<PlayerSide, FirestorePlayerCardState>;

export interface OnlineGameDocument {
  gameId: string;
  gameVersion: OnlineGameVersion;
  createdAt: number;
  updatedAt: number;
  status: OnlineGameStatus;
  currentPlayer: PlayerSide;
  bluePlayerId?: string;
  redPlayerId?: string;
  gameState: FirestoreGameState;
  moveHistory: FirestoreMoveHistoryEntry[];
  matchNumber: number;
  rematch?: OnlineRematchState;
  previousResults?: OnlineMatchResult[];
  pendingCombat?: FirestorePendingCombat | null;
  winner?: PlayerSide | null;
  reason?: OnlineFinishReason | null;
}

export type OnlineGameViewDocument = Omit<OnlineGameDocument, "gameState" | "moveHistory" | "pendingCombat"> & {
  gameState: GameState;
  moveHistory: OnlineMoveHistoryEntry[];
  pendingCombat?: PendingCombat | null;
};

export type OnlineSession = {
  gameId: string;
  playerId: string;
  role: OnlinePlayerRole;
  game?: OnlineGameViewDocument;
};

export type OnlineMoveValidation = {
  legal: boolean;
  move?: LegalMove;
  reason?: string;
};
