import { getPiecePosition, samePosition } from "../engine/board";
import { PieceLabelMode } from "../engine/data/classProfiles";
import { getKingThreats } from "../engine/kingThreat";
import { deriveLastMoveHighlight, includesHighlightSquare, isSameHighlightSquare } from "../engine/lastMoveHighlight";
import { GameState, LegalMove, Position } from "../engine/types";
import { Square } from "./Square";

type BoardProps = {
  state: GameState;
  legalMoves: LegalMove[];
  onSquareClick: (position: Position) => void;
  humanTurn?: boolean;
  labelMode: PieceLabelMode;
};

export function Board({ state, legalMoves, onSquareClick, humanTurn = true, labelMode }: BoardProps) {
  const selectedPosition = state.selectedPieceId ? getPiecePosition(state.board, state.selectedPieceId) : undefined;
  const lastMoveHighlight = deriveLastMoveHighlight(state.lastMove);
  const kingThreats = [...getKingThreats(state, "Blue"), ...getKingThreats(state, "Red")];
  const checkedKingIds = new Set(kingThreats.map((threat) => threat.kingPieceId));
  const threateningPieceIds = new Set(kingThreats.map((threat) => threat.attackerPieceId));
  const displayRanks = [...state.board].reverse();
  const files = ["A", "B", "C", "D", "E", "F", "G"];

  return (
    <div className="board-frame">
      <div className="file-labels" aria-hidden="true">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <div className="board-row">
        <div className="rank-labels" aria-hidden="true">
          {[7, 6, 5, 4, 3, 2, 1].map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>
        <div className="board" aria-label="Frontier Chess board">
          {displayRanks.map((rank) =>
            rank.map((square) => {
              const piece = square.pieceId ? state.pieces[square.pieceId] : undefined;
              const legalMove = legalMoves.find((move) => samePosition(move.to, square.position));
              const isSelected = selectedPosition ? samePosition(selectedPosition, square.position) : false;

              return (
                <Square
                  currentPlayer={state.turn}
                  humanTurn={humanTurn}
                  isCannonScreenSquare={includesHighlightSquare(lastMoveHighlight.cannonScreenSquares, square.position)}
                  isLastBattleSquare={
                    (lastMoveHighlight.kind === "combatAttackerWon" || lastMoveHighlight.kind === "combatDefenderWon") &&
                    isSameHighlightSquare(lastMoveHighlight.to, square.position)
                  }
                  isLastCapturedOrRemovedSquare={isSameHighlightSquare(lastMoveHighlight.removedPieceSquare, square.position)}
                  isLastMoveFrom={isSameHighlightSquare(lastMoveHighlight.from, square.position)}
                  isLastMovePiece={piece?.id === lastMoveHighlight.movedPieceId && isSameHighlightSquare(lastMoveHighlight.finalPieceSquare, square.position)}
                  isLastMoveTo={isSameHighlightSquare(lastMoveHighlight.to, square.position)}
                  isKingInCheck={piece ? checkedKingIds.has(piece.id) : false}
                  isSelected={isSelected}
                  isThreateningKing={piece ? threateningPieceIds.has(piece.id) : false}
                  key={`${square.position.col}-${square.position.row}`}
                  labelMode={labelMode}
                  legalMove={legalMove}
                  onClick={onSquareClick}
                  piece={piece}
                  position={square.position}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
