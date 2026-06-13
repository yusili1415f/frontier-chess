import { coordinateLabel, getPiecePosition } from "../../engine/board";
import {
  averageCombatValueForPiece,
  getCombatProfileForPiece,
  getCombatProfileNameForPiece,
  getPieceDisplayLabel,
  PieceLabelMode,
} from "../../engine/data/classProfiles";
import { classifyMove, getLegalMovesForPiece } from "../../engine/movement";
import { GameState, MoveClassificationKind, Piece } from "../../engine/types";

type SelectedPiecePanelProps = {
  state: GameState;
  selectedPiece?: Piece;
  labelMode: PieceLabelMode;
};

export function SelectedPiecePanel({ state, selectedPiece, labelMode }: SelectedPiecePanelProps) {
  const selectedSquare = selectedPiece ? getPiecePosition(state.board, selectedPiece.id) : undefined;
  const legalMoves = selectedPiece ? getLegalMovesForPiece(state, selectedPiece.id) : [];
  const grouped = {
    normalMove: legalMoves.filter((move) => move.classification?.kind === "normalMove"),
    directCapture: legalMoves.filter((move) => move.classification?.kind === "directCapture"),
    combatCapture: legalMoves.filter((move) => move.classification?.kind === "combatCapture"),
  };

  return (
    <section className="panel-block selected-piece-panel">
      <h2>Selected Piece</h2>
      {selectedPiece && selectedSquare ? (
        <>
          <div className="selected-summary">
            <strong>
              {selectedPiece.side} {selectedPiece.type} at {coordinateLabel(selectedSquare)}
            </strong>
            <span>Board label: {getPieceDisplayLabel(selectedPiece, labelMode)}</span>
            <span>Promoted: {selectedPiece.promoted ? "yes" : "no"}</span>
            <span>
              Profile: {getCombatProfileNameForPiece(selectedPiece)} [{getCombatProfileForPiece(selectedPiece).join(", ")}]
              {" "}avg {averageCombatValueForPiece(selectedPiece).toFixed(1)}
            </span>
            <span>ID: {selectedPiece.id}</span>
          </div>
          <MoveGroup title="Normal Moves" kind="normalMove" moves={grouped.normalMove} state={state} piece={selectedPiece} />
          <MoveGroup title="Direct Captures" kind="directCapture" moves={grouped.directCapture} state={state} piece={selectedPiece} />
          <MoveGroup title="Combat Captures" kind="combatCapture" moves={grouped.combatCapture} state={state} piece={selectedPiece} />
        </>
      ) : (
        <p>Select a current-player piece to inspect legal moves.</p>
      )}
    </section>
  );
}

type MoveGroupProps = {
  title: string;
  kind: MoveClassificationKind;
  moves: ReturnType<typeof getLegalMovesForPiece>;
  state: GameState;
  piece: Piece;
};

function MoveGroup({ title, moves, state, piece }: MoveGroupProps) {
  return (
    <div className="move-group">
      <h3>{title}</h3>
      {moves.length ? (
        <ul>
          {moves.map((move) => {
            const classification = move.classification ?? classifyMove(state, piece.id, move.to);
            return (
              <li key={`${move.to.col}-${move.to.row}`}>
                <strong>{coordinateLabel(move.to)}</strong>
                {classification.targetPiece ? (
                  <span>
                    {classification.targetPiece.side} {classification.targetPiece.type}
                  </span>
                ) : null}
                <small>{classification.reason}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>none</p>
      )}
    </div>
  );
}
