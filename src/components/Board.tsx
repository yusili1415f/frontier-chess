import { getPiecePosition, samePosition } from "../engine/board";
import { GameState, LegalMove, Position } from "../engine/types";
import { Square } from "./Square";

type BoardProps = {
  state: GameState;
  legalMoves: LegalMove[];
  onSquareClick: (position: Position) => void;
  humanTurn?: boolean;
};

export function Board({ state, legalMoves, onSquareClick, humanTurn = true }: BoardProps) {
  const selectedPosition = state.selectedPieceId ? getPiecePosition(state.board, state.selectedPieceId) : undefined;
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
                  isSelected={isSelected}
                  key={`${square.position.col}-${square.position.row}`}
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
