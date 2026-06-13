import { coordinateLabel, isFrontierLine, isFrontierZone, isHomeTerritory } from "../engine/board";
import { LegalMove, Piece as PieceModel, PlayerSide, Position } from "../engine/types";
import { Piece } from "./Piece";

type SquareProps = {
  position: Position;
  piece?: PieceModel;
  currentPlayer: PlayerSide;
  humanTurn: boolean;
  isSelected: boolean;
  legalMove?: LegalMove;
  onClick: (position: Position) => void;
};

export function Square({ position, piece, currentPlayer, humanTurn, isSelected, legalMove, onClick }: SquareProps) {
  const label = coordinateLabel(position);
  const tooltip = legalMove?.classification
    ? `${classificationTitle(legalMove.classification.kind)}${
        legalMove.classification.cannonScreenCount !== undefined
          ? `: ${legalMove.classification.cannonScreenCount} screen`
          : ""
      }${legalMove.classification.promotesPiece ? " · Promotes on landing" : ""}`
    : piece
      ? `${piece.side} ${piece.type}${piece.promoted ? " — Promoted" : ""}`
      : label;

  return (
    <button
      aria-label={`${label}${piece ? ` ${piece.side} ${piece.type}` : ""}`}
      className={[
        "square",
        (position.col + position.row) % 2 === 0 ? "light" : "dark",
        isHomeTerritory("Blue", position) ? "blue-home" : "",
        isHomeTerritory("Red", position) ? "red-home" : "",
        isFrontierZone(position) ? "frontier-zone" : "",
        isFrontierLine(position) ? "frontier-line" : "",
        isSelected ? "selected" : "",
        legalMove ? `legal ${legalMove.classification?.kind ?? legalMove.kind}` : "",
        humanTurn && piece?.side === currentPlayer ? "human-selectable" : "",
        !humanTurn ? "ai-turn-locked" : "",
      ].join(" ")}
      onClick={() => onClick(position)}
      title={tooltip}
      type="button"
    >
      <span className="coord">{label}</span>
      {legalMove ? <span className="move-dot" aria-hidden="true" /> : null}
      {piece ? <Piece currentPlayer={currentPlayer} humanTurn={humanTurn} isSelected={isSelected} piece={piece} /> : null}
    </button>
  );
}

function classificationTitle(kind: string): string {
  switch (kind) {
    case "normalMove":
      return "Normal move";
    case "directCapture":
      return "Direct capture";
    case "combatCapture":
      return "Combat capture";
    default:
      return "Illegal";
  }
}
