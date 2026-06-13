export const BOARD_SIZE = 7;
export const FILES = ["A", "B", "C", "D", "E", "F", "G"] as const;

export type PlayerSide = "Blue" | "Red";

export type PieceType = "King" | "Rook" | "Knight" | "Bishop" | "Cannon" | "Guard" | "Pawn";

export type Position = {
  col: number;
  row: number;
};

export type Piece = {
  id: string;
  side: PlayerSide;
  type: PieceType;
  promoted?: boolean;
};

export type BoardSquare = {
  position: Position;
  pieceId?: string;
};

export type Board = BoardSquare[][];

export type MoveKind = "move" | "capture";

export type LegalMove = {
  from: Position;
  to: Position;
  kind: MoveKind;
  classification?: MoveClassification;
};

export type MoveClassificationKind = "illegal" | "normalMove" | "directCapture" | "combatCapture";

export type CannonCaptureDetails = {
  screenCount: number;
  screenSquares: Position[];
  startsInHomeTerritory: boolean;
  usesCombat: boolean;
};

export type MoveClassification = {
  legal: boolean;
  kind: MoveClassificationKind;
  from?: Position;
  to: Position;
  reason: string;
  targetPieceId?: string;
  targetPiece?: Piece;
  cannon?: CannonCaptureDetails;
  cannonScreenCount?: number;
  cannonScreenSquares?: Position[];
  startsInHomeTerritory?: boolean;
  promotesPiece?: boolean;
};

export type CombatProfile = {
  type: PieceType;
  dice: readonly number[];
};

export type CombatResult = {
  attackerId: string;
  defenderId: string;
  attackerType: PieceType;
  defenderType: PieceType;
  attackerRollIndex: number;
  defenderRollIndex: number;
  attackerValue: number;
  defenderValue: number;
  winner: PlayerSide;
  attackerWon: boolean;
  target: Position;
  forcedDice?: boolean;
};

export type ForcedDice = {
  attackerRollIndex?: number;
  defenderRollIndex?: number;
  attackerValue?: number;
  defenderValue?: number;
};

export type MoveRecord = {
  text: string;
  turnNumber: number;
  player: PlayerSide;
  actor?: "Human" | "AI";
  attacker: Piece;
  defender?: Piece;
  move: LegalMove;
  capturedPieceId?: string;
  combat?: CombatResult;
  captureType?: "Direct" | "Combat";
  removedPiece?: Piece;
  cannon?: CannonCaptureDetails;
  promotedPiece?: Piece;
  promotionProfileName?: string;
};

export type GameState = {
  board: Board;
  pieces: Record<string, Piece>;
  turn: PlayerSide;
  turnNumber: number;
  selectedPieceId?: string;
  log: string[];
  moveHistory: MoveRecord[];
  lastMove?: MoveRecord;
  forcedDice?: ForcedDice;
  winner?: PlayerSide;
};
