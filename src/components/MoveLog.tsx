import { coordinateLabel } from "../engine/board";
import { getCombatProfileNameForPiece, getPieceDisplayLabel, PieceLabelMode } from "../engine/data/classProfiles";
import { MoveRecord } from "../engine/types";

type MoveLogProps = {
  history: MoveRecord[];
  labelMode: PieceLabelMode;
};

export function MoveLog({ history, labelMode }: MoveLogProps) {
  return (
    <section className="panel-block log-block">
      <h2>Move Log</h2>
      {history.length === 0 ? (
        <p>No moves yet.</p>
      ) : (
        <ol>
          {history.map((record) => (
            <li key={`${record.turnNumber}-${record.text}`}>
              <div className="log-heading">
                <strong>Turn {record.turnNumber} · {record.actor ?? "Unknown"} {record.player}</strong>
                <span className="log-badge-group">
                  <span className={`log-badge ${actionType(record).toLowerCase().replace(" ", "-")}`}>{actionType(record)}</span>
                  {record.checkedSides?.length ? <span className="log-badge check">Check</span> : null}
                </span>
              </div>
              <span>{describeRecord(record, labelMode)}</span>
              <small>
                ID: {record.attacker.id} · {coordinateLabel(record.move.from)} → {coordinateLabel(record.move.to)}
                {record.defender ? ` · Captured/target: ${record.defender.side} ${record.defender.type} (${record.defender.id})` : ""}
                {record.cannon?.screenSquares.length ? ` · Screen: ${record.cannon.screenSquares.map(coordinateLabel).join(", ")}` : ""}
                {record.combat ? ` · Winner: ${record.combat.winner}` : ""}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function actionType(record: MoveRecord): string {
  if (record.combat) {
    return "Combat";
  }

  if (record.defender) {
    return "Direct Capture";
  }

  if (record.promotedPiece) {
    return "Promotion";
  }

  return "Move";
}

function describeRecord(record: MoveRecord, labelMode: PieceLabelMode): string {
  const check = record.checkedSides?.length ? ` ${record.checkedSides.map((side) => `${side} King is in check`).join(" ")}` : "";

  if (record.combat && record.defender && record.removedPiece) {
    const forced = record.combat.forcedDice ? " Forced dice debug mode." : "";
    const manual = record.combat.manualRoll
      ? ` Manual dice: ${record.attacker.side} die ${record.combat.attackerRollIndex + 1} → ${record.combat.attackerValue}${record.combat.attackerAutoRolled ? " (auto)" : ""}; ${record.defender.side} die ${record.combat.defenderRollIndex + 1} → ${record.combat.defenderValue}${record.combat.defenderAutoRolled ? " (auto)" : ""}.`
      : "";
    const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
    return `${getCombatProfileNameForPiece(record.attacker)} (${getPieceDisplayLabel(record.attacker, labelMode)}) ${coordinateLabel(record.move.from)} attacks ${record.defender.side} ${getCombatProfileNameForPiece(record.defender)} (${getPieceDisplayLabel(record.defender, labelMode)}) ${coordinateLabel(record.move.to)}. Combat: ${getCombatProfileNameForPiece(record.attacker)} rolls ${record.combat.attackerValue}, ${getCombatProfileNameForPiece(record.defender)} rolls ${record.combat.defenderValue}. Attacker wins ties.${forced}${manual} ${record.combat.attackerWon ? "Attacker wins" : "Defender wins"}. ${record.removedPiece.side} ${record.removedPiece.type} removed.${promotion}${check}`;
  }

  if (record.defender) {
    const screen = record.cannon?.screenSquares.length
      ? ` Screen: ${record.cannon.screenSquares.map(coordinateLabel).join(", ")}.`
      : "";
    const home = record.cannon?.startsInHomeTerritory ? " from home territory" : "";
    const noCombat = record.cannon?.startsInHomeTerritory ? " No combat because Cannon launched from home territory." : "";
    const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
    return `${record.attacker.type} (${getPieceDisplayLabel(record.attacker, labelMode)}) ${coordinateLabel(record.move.from)} captures ${record.defender.side} ${record.defender.type} (${getPieceDisplayLabel(record.defender, labelMode)}) ${coordinateLabel(record.move.to)} directly${home}.${screen}${noCombat}${promotion}${check}`;
  }

  const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
  return `${record.attacker.type} (${getPieceDisplayLabel(record.attacker, labelMode)}) ${coordinateLabel(record.move.from)} -> ${coordinateLabel(record.move.to)}.${promotion}${check}`;
}
