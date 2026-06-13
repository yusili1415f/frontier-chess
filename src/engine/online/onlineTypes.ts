import { MoveActor } from "../history";
import { GameState, LegalMove, MoveRecord, PieceType, PlayerSide, Position } from "../types";

export type OnlineGameStatus = "waiting" | "active" | "finished";
export type OnlinePlayerRole = PlayerSide | "Spectator";
export type OnlineFinishReason = "kingCaptured" | "maxTurns" | "noLegalMoves";

export type OnlineMoveInput = {
  pieceId: string;
  to: Position;
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
  combatWinner?: PlayerSide | null;
  combatAttackerWon?: boolean | null;
  promotedPieceId?: string | null;
  promotionProfileName?: string | null;
  cannonScreenSquares?: string[];
  cannonStartsInHomeTerritory?: boolean | null;
};

export interface FirestoreGameState {
  turn: PlayerSide;
  turnNumber: number;
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

export interface OnlineGameDocument {
  gameId: string;
  createdAt: number;
  updatedAt: number;
  status: OnlineGameStatus;
  currentPlayer: PlayerSide;
  bluePlayerId?: string;
  redPlayerId?: string;
  gameState: FirestoreGameState;
  moveHistory: FirestoreMoveHistoryEntry[];
  winner?: PlayerSide | null;
  reason?: OnlineFinishReason | null;
}

export type OnlineGameViewDocument = Omit<OnlineGameDocument, "gameState" | "moveHistory"> & {
  gameState: GameState;
  moveHistory: OnlineMoveHistoryEntry[];
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
