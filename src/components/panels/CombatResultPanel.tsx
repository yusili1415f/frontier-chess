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
          <span>
            Attacker die face {record.combat.attackerRollIndex + 1} → profile value {record.combat.attackerBaseValue}
            {record.combat.attackerAutoRolled ? " (auto-rolled)" : ""}
          </span>
          {record.combat.attackerModifiers.map((modifier) => (
            <span key={`${modifier.source}-${modifier.pieceId}-${modifier.value}`}>
              Faction effect: {modifier.source} {formatSigned(modifier.value)} — {modifier.description}.
            </span>
          ))}
          <span>Attacker final value: {record.combat.attackerFinalValue}</span>
          <span>
            Defender die face {record.combat.defenderRollIndex + 1} → profile value {record.combat.defenderBaseValue}
            {record.combat.defenderAutoRolled ? " (auto-rolled)" : ""}
          </span>
          {record.combat.defenderModifiers.map((modifier) => (
            <span key={`${modifier.source}-${modifier.pieceId}-${modifier.value}`}>
              Faction effect: {modifier.source} {formatSigned(modifier.value)} — {modifier.description}.
            </span>
          ))}
          <span>Defender final value: {record.combat.defenderFinalValue}</span>
          <span>Final comparison: {record.combat.attackerFinalValue} vs {record.combat.defenderFinalValue}</span>
          <span>Tie: attacker wins</span>
          {record.combat.forcedDice ? <span>Forced dice debug mode was used.</span> : null}
          {record.combat.manualRoll ? <span>Manual dice roll flow was used.</span> : null}
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

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
