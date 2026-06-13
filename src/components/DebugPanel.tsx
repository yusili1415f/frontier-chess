import {
  averageCombatValue,
  averageCombatValueForPiece,
  CLASS_COMBAT_PROFILES,
  FRONTIER_COMBAT_PROFILES,
  getCombatProfileForPiece,
  getCombatProfileNameForPiece,
  getPieceAbbreviation,
  PIECE_ABBREVIATIONS,
  PIECE_TYPES,
} from "../engine/data/classProfiles";
import { coordinateLabel, getPiecePosition } from "../engine/board";
import { classifyMove, getLegalMovesForPiece } from "../engine/movement";
import { GameState, Piece } from "../engine/types";

type DebugPanelProps = {
  state: GameState;
  selectedPiece?: Piece;
  validation: { passed: boolean; messages: string[] };
};

export function DebugPanel({ state, selectedPiece, validation }: DebugPanelProps) {
  const selectedSquare = selectedPiece ? getPiecePosition(state.board, selectedPiece.id) : undefined;
  const legalMoves = selectedPiece ? getLegalMovesForPiece(state, selectedPiece.id) : [];

  return (
    <aside className="debug-panel">
      <section className="panel-block">
        <div className="turn-row">
          <span>Current Player</span>
          <strong className={state.turn.toLowerCase()}>{state.winner ? `${state.winner} wins` : state.turn}</strong>
        </div>
        <div className="selected-card">
          <span>Selected Piece</span>
          {selectedPiece && selectedSquare ? (
            <div className="selected-detail">
              <strong>
                {selectedPiece.side} {selectedPiece.type} at {coordinateLabel(selectedSquare)}
              </strong>
              <span>ID: {selectedPiece.id}</span>
              <span>Side: {selectedPiece.side}</span>
              <span>Type: {selectedPiece.type}</span>
              <span>Board label: {getPieceAbbreviation(selectedPiece)}</span>
              <span>Square: {coordinateLabel(selectedSquare)}</span>
              <span>Promoted: {selectedPiece.promoted ? "yes" : "no"}</span>
              <span>
                Active combat profile: {getCombatProfileNameForPiece(selectedPiece)} [
                {getCombatProfileForPiece(selectedPiece).join(", ")}] avg{" "}
                {averageCombatValueForPiece(selectedPiece).toFixed(1)}
              </span>
            </div>
          ) : (
            <strong>None</strong>
          )}
        </div>
      </section>

      <section className="panel-block legal-moves">
        <h2>Selected Piece Legal Moves</h2>
        {selectedPiece && selectedSquare ? (
          legalMoves.length ? (
            <ol>
              {legalMoves.map((move) => {
                const classification = move.classification ?? classifyMove(state, selectedPiece.id, move.to);
                return (
                  <li key={`${move.to.col}-${move.to.row}`}>
                    <strong>{coordinateLabel(move.to)}</strong>
                    <span>{classificationLabel(classification.kind)}</span>
                    {classification.targetPiece ? (
                      <span>
                        Target: {classification.targetPiece.side} {classification.targetPiece.type}
                      </span>
                    ) : null}
                    {classification.promotesPiece ? <span>Promotes on landing</span> : null}
                    <small>{classification.reason}</small>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>No legal moves.</p>
          )
        ) : (
          <p>Select a piece to inspect legal moves.</p>
        )}
      </section>

      <section className="panel-block">
        <h2>Last Move</h2>
        {state.lastMove ? (
          <div className="last-move">
            <p>{state.lastMove.text}</p>
            {state.lastMove.combat ? (
              <div className="combat-rolls">
                <strong>Combat rolls</strong>
                <span>
                  {state.lastMove.combat.attackerType} rolled die {state.lastMove.combat.attackerRollIndex + 1}:{" "}
                  {state.lastMove.combat.attackerValue}
                </span>
                <span>
                  {state.lastMove.combat.defenderType} rolled die {state.lastMove.combat.defenderRollIndex + 1}:{" "}
                  {state.lastMove.combat.defenderValue}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p>No move yet.</p>
        )}
      </section>

      <section className="panel-block">
        <h2>Combat Profiles</h2>
        <div className="profile-list">
          {PIECE_TYPES.map((type) => (
            <div className="profile-row" key={type}>
              <span className="profile-glyph">{PIECE_ABBREVIATIONS[type]}</span>
              <div>
                <strong>{type}</strong>
                <span>
                  [{CLASS_COMBAT_PROFILES[type].dice.join(", ")}] avg {averageCombatValue(type).toFixed(1)}
                </span>
              </div>
            </div>
          ))}
          <div className="profile-row">
            <span className="profile-glyph">FP</span>
            <div>
              <strong>Frontier Pawn</strong>
              <span>[{FRONTIER_COMBAT_PROFILES.FrontierPawn.dice.join(", ")}] avg 3.2</span>
            </div>
          </div>
          <div className="profile-row">
            <span className="profile-glyph">FG</span>
            <div>
              <strong>Frontier Guard</strong>
              <span>[{FRONTIER_COMBAT_PROFILES.FrontierGuard.dice.join(", ")}] avg 4.2</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel-block">
        <h2>Validation</h2>
        <p className={validation.passed ? "validation-pass" : "validation-fail"}>
          {validation.passed ? "All console validation checks passed." : "Some validation checks failed."}
        </p>
        <ol className="validation-list">
          {validation.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ol>
      </section>

    </aside>
  );
}

function classificationLabel(kind: string): string {
  switch (kind) {
    case "normalMove":
      return "normal move";
    case "directCapture":
      return "direct capture";
    case "combatCapture":
      return "combat capture";
    default:
      return "illegal";
  }
}
