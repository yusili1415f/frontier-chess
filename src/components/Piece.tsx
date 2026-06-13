import { getPieceAbbreviation } from "../engine/data/classProfiles";
import { Piece as PieceModel } from "../engine/types";

type PieceProps = {
  piece: PieceModel;
  currentPlayer: PieceModel["side"];
  humanTurn: boolean;
  isSelected: boolean;
};

export function Piece({ piece, currentPlayer, humanTurn, isSelected }: PieceProps) {
  return (
    <span
      className={[
        "piece-token",
        `piece-${piece.side.toLowerCase()}`,
        piece.promoted ? "promoted" : "",
        piece.side === currentPlayer ? "active-side" : "inactive-side",
        humanTurn && piece.side === currentPlayer ? "human-token" : "",
        !humanTurn && piece.side === currentPlayer ? "ai-token" : "",
        isSelected ? "selected-token" : "",
      ].join(" ")}
      title={`${piece.side} ${piece.type}${piece.promoted ? " — Promoted" : ""}`}
    >
      {getPieceAbbreviation(piece)}
    </span>
  );
}
