import {
  coordinateLabel,
  getSquaresBetween,
  getPiecePosition,
  getSquare,
  hasPawnCrossedFrontier,
  isDiagonallyAligned,
  isHomeTerritory,
  isInsideBoard,
  isOrthogonallyAligned,
  isFrontierZone,
  samePosition,
} from "./board";
import { shouldPromote } from "./promotion";
import { Board, GameState, LegalMove, MoveClassification, Piece, Position } from "./types";

export function getLegalMovesForPiece(state: GameState, pieceId: string): LegalMove[] {
  const piece = state.pieces[pieceId];
  const from = getPiecePosition(state.board, pieceId);

  if (!piece || !from || piece.side !== state.turn || state.winner) {
    return [];
  }

  const moves = (() => {
    switch (piece.type) {
    case "King":
    case "Guard":
      return stepMoves(state, piece, from, allDirections());
    case "Rook":
      return slidingMoves(state, piece, from, orthogonalDirections());
    case "Bishop":
      return slidingMoves(state, piece, from, diagonalDirections());
    case "Knight":
      return knightMoves(state, piece, from);
    case "Cannon":
      return cannonMoves(state, piece, from);
    case "Pawn":
      return pawnMoves(state, piece, from);
    }
  })();

  return moves.map((move) => ({ ...move, classification: classifyMove(state, pieceId, move.to) }));
}

export function getLegalMove(state: GameState, pieceId: string, to: Position): LegalMove | undefined {
  return getLegalMovesForPiece(state, pieceId).find((move) => samePosition(move.to, to));
}

export function classifyMove(state: GameState, pieceId: string, to: Position): MoveClassification {
  const piece = state.pieces[pieceId];
  const from = piece ? getPiecePosition(state.board, pieceId) : undefined;
  const targetPieceId = getSquare(state.board, to)?.pieceId;
  const targetPiece = targetPieceId ? state.pieces[targetPieceId] : undefined;

  if (!piece || !from) {
    return { legal: false, kind: "illegal", to, reason: "Piece is not on the board." };
  }

  if (!isInsideBoard(to)) {
    return { legal: false, kind: "illegal", from, to, reason: "Target is outside the board." };
  }

  if (piece.side !== state.turn) {
    return { legal: false, kind: "illegal", from, to, reason: "Only the current player can move this piece.", targetPieceId, targetPiece };
  }

  if (targetPiece?.side === piece.side) {
    return { legal: false, kind: "illegal", from, to, reason: "Friendly pieces cannot be captured.", targetPieceId, targetPiece };
  }

  const legal = rawLegalMovesForPiece(state, piece, from).find((move) => samePosition(move.to, to));
  if (!legal) {
    return {
      legal: false,
      kind: "illegal",
      from,
      to,
      reason: piece.type === "Cannon" ? cannonIllegalReason(state, piece, from, to) : "Target is not legal for this piece.",
      targetPieceId,
      targetPiece,
    };
  }

  if (!targetPiece) {
    return {
      legal: true,
      kind: "normalMove",
      from,
      to,
      reason: normalMoveReason(piece, from, to),
      promotesPiece: shouldPromote(piece, to),
    };
  }

  const cannon = piece.type === "Cannon" ? cannonDetails(state, piece, from, to) : undefined;
  const usesCombat = cannon ? cannon.usesCombat : isFrontierZone(to);
  return {
    legal: true,
    kind: usesCombat ? "combatCapture" : "directCapture",
    from,
    to,
    reason: captureReason(piece, from, to, usesCombat, cannon),
    targetPieceId,
    targetPiece,
    cannon,
    cannonScreenCount: cannon?.screenCount,
    cannonScreenSquares: cannon?.screenSquares,
    startsInHomeTerritory: cannon?.startsInHomeTerritory,
    promotesPiece: shouldPromote(piece, to),
  };
}

function rawLegalMovesForPiece(state: GameState, piece: Piece, from: Position): LegalMove[] {
  switch (piece.type) {
    case "King":
    case "Guard":
      return stepMoves(state, piece, from, allDirections());
    case "Rook":
      return slidingMoves(state, piece, from, orthogonalDirections());
    case "Bishop":
      return slidingMoves(state, piece, from, diagonalDirections());
    case "Knight":
      return knightMoves(state, piece, from);
    case "Cannon":
      return cannonMoves(state, piece, from);
    case "Pawn":
      return pawnMoves(state, piece, from);
  }
}

function stepMoves(state: GameState, piece: Piece, from: Position, directions: number[][]): LegalMove[] {
  return directions.flatMap(([dc, dr]) => landableMove(state, piece, from, { col: from.col + dc, row: from.row + dr }));
}

function knightMoves(state: GameState, piece: Piece, from: Position): LegalMove[] {
  return [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ].flatMap(([dc, dr]) => landableMove(state, piece, from, { col: from.col + dc, row: from.row + dr }));
}

function slidingMoves(state: GameState, piece: Piece, from: Position, directions: number[][]): LegalMove[] {
  const moves: LegalMove[] = [];

  directions.forEach(([dc, dr]) => {
    for (let distance = 1; distance < 7; distance += 1) {
      const to = { col: from.col + dc * distance, row: from.row + dr * distance };
      if (!isInsideBoard(to)) {
        break;
      }

      const occupant = occupantAt(state, to);
      if (!occupant) {
        moves.push({ from, to, kind: "move" });
        continue;
      }

      if (occupant.side !== piece.side) {
        moves.push({ from, to, kind: "capture" });
      }
      break;
    }
  });

  return moves;
}

function cannonMoves(state: GameState, piece: Piece, from: Position): LegalMove[] {
  const moves: LegalMove[] = [];

  orthogonalDirections().forEach(([dc, dr]) => {
    let interveningPieces = 0;

    for (let distance = 1; distance < 7; distance += 1) {
      const to = { col: from.col + dc * distance, row: from.row + dr * distance };
      if (!isInsideBoard(to)) {
        break;
      }

      const occupant = occupantAt(state, to);
      if (!occupant) {
        if (interveningPieces === 0) {
          moves.push({ from, to, kind: "move" });
        }
        continue;
      }

      if (interveningPieces === 1 && occupant.side !== piece.side) {
        moves.push({ from, to, kind: "capture" });
      }

      interveningPieces += 1;
      if (interveningPieces >= 2) {
        break;
      }
    }
  });

  return moves;
}

export function countInterveningPieces(board: Board, from: Position, to: Position): number {
  if (!isOrthogonallyAligned(from, to)) {
    return Number.POSITIVE_INFINITY;
  }

  return getScreenSquares(board, from, to).length;
}

export function getScreenSquares(board: Board, from: Position, to: Position): Position[] {
  if (!isOrthogonallyAligned(from, to)) {
    return [];
  }

  return getSquaresBetween(from, to).filter((position) => Boolean(getSquare(board, position)?.pieceId));
}

function pawnMoves(state: GameState, piece: Piece, from: Position): LegalMove[] {
  const forward = piece.side === "Blue" ? 1 : -1;
  const crossed = hasPawnCrossedFrontier(piece.side, from);
  const offsets = crossed
    ? [
        [0, forward],
        [-1, forward],
        [1, forward],
        [-1, 0],
        [1, 0],
      ]
    : [
        [0, forward],
        [-1, forward],
        [1, forward],
      ];

  return offsets.flatMap(([dc, dr]) => landableMove(state, piece, from, { col: from.col + dc, row: from.row + dr }));
}

function landableMove(state: GameState, piece: Piece, from: Position, to: Position): LegalMove[] {
  if (!isInsideBoard(to)) {
    return [];
  }

  const occupant = occupantAt(state, to);
  if (!occupant) {
    return [{ from, to, kind: "move" }];
  }

  if (occupant.side === piece.side) {
    return [];
  }

  return [{ from, to, kind: "capture" }];
}

function occupantAt(state: GameState, position: Position): Piece | undefined {
  const pieceId = getSquare(state.board, position)?.pieceId;
  return pieceId ? state.pieces[pieceId] : undefined;
}

function orthogonalDirections(): number[][] {
  return [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
}

function diagonalDirections(): number[][] {
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
}

function allDirections(): number[][] {
  return [...orthogonalDirections(), ...diagonalDirections()];
}

function cannonDetails(state: GameState, cannon: Piece, from: Position, to: Position) {
  const screenSquares = getScreenSquares(state.board, from, to);
  const startsInHomeTerritory = isHomeTerritory(cannon.side, from);
  return {
    screenCount: screenSquares.length,
    screenSquares,
    startsInHomeTerritory,
    usesCombat: !startsInHomeTerritory && isFrontierZone(to),
  };
}

function normalMoveReason(piece: Piece, from: Position, to: Position): string {
  if (piece.type === "Cannon" || piece.type === "Rook" || piece.type === "Bishop") {
    return `Normal move, path clear from ${coordinateLabel(from)} to ${coordinateLabel(to)}.`;
  }
  return "Normal move.";
}

function captureReason(
  piece: Piece,
  from: Position,
  to: Position,
  usesCombat: boolean,
  cannon?: ReturnType<typeof cannonDetails>,
): string {
  if (piece.type === "Cannon" && cannon) {
    const screens = cannon.screenSquares.map(coordinateLabel).join(", ");
    if (cannon.startsInHomeTerritory) {
      return `Direct Cannon capture from home territory. Screen: ${screens}.`;
    }
    return `${usesCombat ? "Combat" : "Direct"} Cannon capture with exactly 1 screen at ${screens}.`;
  }

  return usesCombat ? "Capture enters the Frontier Zone, so dice combat triggers." : "Direct capture outside the Frontier Zone.";
}

function cannonIllegalReason(state: GameState, cannon: Piece, from: Position, to: Position): string {
  const targetPieceId = getSquare(state.board, to)?.pieceId;
  const targetPiece = targetPieceId ? state.pieces[targetPieceId] : undefined;

  if (!isOrthogonallyAligned(from, to)) {
    return isDiagonallyAligned(from, to)
      ? "Cannon cannot capture diagonally."
      : "Cannon must move or capture on the same row or column.";
  }

  if (!targetPiece) {
    const blocked = getScreenSquares(state.board, from, to).length > 0;
    return blocked ? "Normal Cannon movement is blocked by an occupied square." : "Empty square is not reachable as a capture.";
  }

  if (targetPiece.side === cannon.side) {
    return "Cannon cannot capture a friendly piece.";
  }

  const screenSquares = getScreenSquares(state.board, from, to);
  if (screenSquares.length === 0) {
    return "Cannon capture needs exactly 1 intervening piece; found 0.";
  }
  return `Cannon capture needs exactly 1 intervening piece; found ${screenSquares.length}.`;
}
