import { MoveActor } from "../history";
import { GameState, LegalMove, MoveRecord, PlayerSide, Position } from "../types";

export type OnlineGameStatus = "waiting" | "active" | "finished";
export type OnlinePlayerRole = PlayerSide | "Spectator";
export type OnlineFinishReason = "kingCaptured" | "maxTurns" | "noLegalMoves";

export type OnlineMoveInput = {
  pieceId: string;
  to: Position;
};

export type OnlineMoveHistoryEntry = MoveRecord & {
  actor: MoveActor;
};

export interface OnlineGameDocument {
  gameId: string;
  createdAt: number;
  updatedAt: number;
  status: OnlineGameStatus;
  currentPlayer: PlayerSide;
  bluePlayerId?: string;
  redPlayerId?: string;
  gameState: GameState;
  moveHistory: OnlineMoveHistoryEntry[];
  winner?: PlayerSide | null;
  reason?: OnlineFinishReason | null;
}

export type OnlineSession = {
  gameId: string;
  playerId: string;
  role: OnlinePlayerRole;
  game?: OnlineGameDocument;
};

export type OnlineMoveValidation = {
  legal: boolean;
  move?: LegalMove;
  reason?: string;
};
