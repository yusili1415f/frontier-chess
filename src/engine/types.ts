import { PlayerCardState } from "./cards/cardTypes";

export const BOARD_SIZE = 7;
export const FILES = ["A", "B", "C", "D", "E", "F", "G"] as const;

export type PlayerSide = "Blue" | "Red";

export type SelectedFactions = {
  Blue: string | null;
  Red: string | null;
};

export type PlayerDrawState = {
  passiveDrawsUsed: number;
  activeDrawsUsed: number;
  capturedPiecesCount: number;
  hasDrawnForThreeCaptures: boolean;
  hasDrawnForFirstFrontierCrossing: boolean;
  hasDrawnForFirstEnemyHomeEntry: boolean;
};

export type CardStateBySide = Record<PlayerSide, PlayerCardState>;

export type DrawStateBySide = Record<PlayerSide, PlayerDrawState>;

export type ActiveMoveCard = {
  side: PlayerSide;
  cardId: string;
  cardName: "Advance";
};

export type PieceType = "King" | "Rook" | "Knight" | "Bishop" | "Cannon" | "Guard" | "Pawn";

export type CombatRollMode = "automatic" | "manual";

export type MobileBoardLockMode = "locked" | "unlocked";

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

export interface CombatModifier {
  source: string;
  side: PlayerSide;
  pieceId: string;
  value: number;
  description: string;
}

export type CombatResult = {
  attackerId: string;
  defenderId: string;
  attackerType: PieceType;
  defenderType: PieceType;
  attackerRollIndex: number;
  defenderRollIndex: number;
  attackerOriginalRollIndex?: number;
  defenderOriginalRollIndex?: number;
  attackerBaseValue: number;
  defenderBaseValue: number;
  attackerOriginalBaseValue?: number;
  defenderOriginalBaseValue?: number;
  attackerModifiers: CombatModifier[];
  defenderModifiers: CombatModifier[];
  attackerFinalValue: number;
  defenderFinalValue: number;
  attackerValue: number;
  defenderValue: number;
  winner: PlayerSide;
  attackerWon: boolean;
  target: Position;
  forcedDice?: boolean;
  manualRoll?: boolean;
  attackerAutoRolled?: boolean;
  defenderAutoRolled?: boolean;
  attackerUsedGambit?: boolean;
  defenderUsedGambit?: boolean;
};

export type ForcedDice = {
  attackerRollIndex?: number;
  defenderRollIndex?: number;
  attackerOriginalRollIndex?: number;
  defenderOriginalRollIndex?: number;
  attackerValue?: number;
  defenderValue?: number;
  attackerOriginalValue?: number;
  defenderOriginalValue?: number;
  manualRoll?: boolean;
  attackerAutoRolled?: boolean;
  defenderAutoRolled?: boolean;
  attackerUsedGambit?: boolean;
  defenderUsedGambit?: boolean;
};

export type PendingCombatStatus =
  | "waitingForAttackerRoll"
  | "waitingForDefenderRoll"
  | "waitingForBothRolls"
  | "gambitWindow"
  | "revealingResult"
  | "resolved";

export interface PendingCombat {
  combatId: string;
  attackerPieceId: string;
  defenderPieceId: string;
  attackerSide: PlayerSide;
  defenderSide: PlayerSide;
  attackerSquare: Position;
  defenderSquare: Position;
  targetSquare: Position;
  attackerProfileName: string;
  defenderProfileName: string;
  attackerProfile: number[];
  defenderProfile: number[];
  attackerDieIndex?: number;
  defenderDieIndex?: number;
  attackerOriginalDieIndex?: number;
  defenderOriginalDieIndex?: number;
  attackerProfileValue?: number;
  defenderProfileValue?: number;
  attackerOriginalProfileValue?: number;
  defenderOriginalProfileValue?: number;
  attackerFinalValue?: number;
  defenderFinalValue?: number;
  attackerModifiers?: CombatModifier[];
  defenderModifiers?: CombatModifier[];
  attackerAutoRolled?: boolean;
  defenderAutoRolled?: boolean;
  attackerUsedGambit?: boolean;
  defenderUsedGambit?: boolean;
  attackerPassedGambit?: boolean;
  defenderPassedGambit?: boolean;
  gambitWindowStartedAt?: number;
  gambitWindowDeadlineAt?: number;
  resultRevealedAt?: number;
  resolveAfterAt?: number;
  winnerSide?: PlayerSide;
  attackerWins?: boolean;
  isTie?: boolean;
  startedAt: number;
  rollDeadlineAt: number;
  status: PendingCombatStatus;
}

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
  checkedSides?: PlayerSide[];
};

export type GameState = {
  board: Board;
  pieces: Record<string, Piece>;
  turn: PlayerSide;
  turnNumber: number;
  selectedFactions: SelectedFactions;
  cards: CardStateBySide;
  drawState: DrawStateBySide;
  activeMoveCard?: ActiveMoveCard;
  selectedPieceId?: string;
  log: string[];
  moveHistory: MoveRecord[];
  lastMove?: MoveRecord;
  forcedDice?: ForcedDice;
  winner?: PlayerSide;
};
