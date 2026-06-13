import { coordinateLabel } from "../engine/board";
import { getCombatProfileNameForPiece } from "../engine/data/classProfiles";
import { MoveRecord } from "../engine/types";

type MoveLogProps = {
  history: MoveRecord[];
};

export function MoveLog({ history }: MoveLogProps) {
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
                <span className={`log-badge ${actionType(record).toLowerCase().replace(" ", "-")}`}>{actionType(record)}</span>
              </div>
              <span>{describeRecord(record)}</span>
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

function describeRecord(record: MoveRecord): string {
  if (record.combat && record.defender && record.removedPiece) {
    const forced = record.combat.forcedDice ? " Forced dice debug mode." : "";
    const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
    return `${getCombatProfileNameForPiece(record.attacker)} ${coordinateLabel(record.move.from)} attacks ${record.defender.side} ${getCombatProfileNameForPiece(record.defender)} ${coordinateLabel(record.move.to)}. Combat: ${getCombatProfileNameForPiece(record.attacker)} rolls ${record.combat.attackerValue}, ${getCombatProfileNameForPiece(record.defender)} rolls ${record.combat.defenderValue}. Attacker wins ties.${forced} ${record.combat.attackerWon ? "Attacker wins" : "Defender wins"}. ${record.removedPiece.side} ${record.removedPiece.type} removed.${promotion}`;
  }

  if (record.defender) {
    const screen = record.cannon?.screenSquares.length
      ? ` Screen: ${record.cannon.screenSquares.map(coordinateLabel).join(", ")}.`
      : "";
    const home = record.cannon?.startsInHomeTerritory ? " from home territory" : "";
    const noCombat = record.cannon?.startsInHomeTerritory ? " No combat because Cannon launched from home territory." : "";
    const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
    return `${record.attacker.type} ${coordinateLabel(record.move.from)} captures ${record.defender.side} ${record.defender.type} ${coordinateLabel(record.move.to)} directly${home}.${screen}${noCombat}${promotion}`;
  }

  const promotion = record.promotedPiece ? ` ${record.promotedPiece.side} ${record.promotedPiece.type} promoted to ${record.promotionProfileName}.` : "";
  return `${record.attacker.type} ${coordinateLabel(record.move.from)} -> ${coordinateLabel(record.move.to)}.${promotion}`;
}
