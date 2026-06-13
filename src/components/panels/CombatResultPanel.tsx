import { coordinateLabel } from "../../engine/board";
import { getCombatProfileForPiece, getCombatProfileNameForPiece, getPieceDisplayLabel, PieceLabelMode } from "../../engine/data/classProfiles";
import { GameState } from "../../engine/types";

type CombatResultPanelProps = {
  state: GameState;
  labelMode: PieceLabelMode;
};

export function CombatResultPanel({ state, labelMode }: CombatResultPanelProps) {
  const record = state.lastMove;

  return (
    <section className="panel-block combat-result-panel">
      <h2>Last Action</h2>
      {!record ? (
        <p>No action yet.</p>
      ) : record.combat && record.defender && record.removedPiece ? (
        <div className="combat-result">
          <strong>
            {record.attacker.side} {record.attacker.type} ({getPieceDisplayLabel(record.attacker, labelMode)}) attacks{" "}
            {record.defender.side} {record.defender.type} ({getPieceDisplayLabel(record.defender, labelMode)}) at{" "}
            {coordinateLabel(record.move.to)}
          </strong>
          <span>
            Attacker profile: {getCombatProfileNameForPiece(record.attacker)} [
            {getCombatProfileForPiece(record.attacker).join(", ")}]
          </span>
          <span>
            Defender profile: {getCombatProfileNameForPiece(record.defender)} [
            {getCombatProfileForPiece(record.defender).join(", ")}]
          </span>
          <span>Rolls: {record.combat.attackerValue} vs {record.combat.defenderValue}</span>
          <span>Tie: attacker wins</span>
          {record.combat.forcedDice ? <span>Forced dice debug mode was used.</span> : null}
          <span>
            Result: {record.combat.attackerWon ? record.attacker.side : record.defender.side} wins.{" "}
            {record.removedPiece.side} {record.removedPiece.type} removed.
          </span>
          {record.promotedPiece ? <span>Promotion: {record.promotedPiece.side} {record.promotedPiece.type} promoted.</span> : null}
        </div>
      ) : (
        <p>{record.text}</p>
      )}
    </section>
  );
}
