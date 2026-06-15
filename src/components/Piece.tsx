import { getPieceDisplayLabel, PieceLabelMode } from "../engine/data/classProfiles";
import { Piece as PieceModel } from "../engine/types";

type PieceProps = {
  piece: PieceModel;
  currentPlayer: PieceModel["side"];
  humanTurn: boolean;
  isKingInCheck: boolean;
  isLastMovePiece: boolean;
  isSelected: boolean;
  isThreateningKing: boolean;
  labelMode: PieceLabelMode;
};

export function Piece({
  piece,
  currentPlayer,
  humanTurn,
  isKingInCheck,
  isLastMovePiece,
  isSelected,
  isThreateningKing,
  labelMode,
}: PieceProps) {
  return (
    <span
      className={[
        "piece-token",
        `label-${labelMode}`,
        `piece-${piece.side.toLowerCase()}`,
        piece.promoted ? "promoted" : "",
        piece.side === currentPlayer ? "active-side" : "inactive-side",
        humanTurn && piece.side === currentPlayer ? "human-token" : "",
        !humanTurn && piece.side === currentPlayer ? "ai-token" : "",
        isKingInCheck ? "king-in-check" : "",
        isLastMovePiece ? "last-moved-piece" : "",
        isSelected ? "selected-token" : "",
        isThreateningKing ? "threatening-king" : "",
      ].join(" ")}
      title={`${piece.side} ${piece.type}${piece.promoted ? " — Promoted" : ""}`}
    >
      {getPieceDisplayLabel(piece, labelMode)}
    </span>
  );
}
