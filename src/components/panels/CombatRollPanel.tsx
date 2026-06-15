import { coordinateLabel } from "../../engine/board";
import { getPendingCombatWinner } from "../../engine/pendingCombat";
import { PendingCombat, PlayerSide } from "../../engine/types";

type CombatRollPanelProps = {
  pendingCombat?: PendingCombat;
  currentRoller?: PlayerSide | "Both" | null;
  secondsRemaining: number;
  onRoll: (side: PlayerSide) => void;
};

export function CombatRollPanel({ pendingCombat, currentRoller = "Both", secondsRemaining, onRoll }: CombatRollPanelProps) {
  if (!pendingCombat) {
    return null;
  }

  const winner = getPendingCombatWinner(pendingCombat);
  const canRollAttacker = canRoll(pendingCombat, pendingCombat.attackerSide, currentRoller);
  const canRollDefender = canRoll(pendingCombat, pendingCombat.defenderSide, currentRoller);

  return (
    <section className="combat-roll-panel" role="dialog" aria-live="polite" aria-label="Combat dice roll">
      <div className="combat-roll-header">
        <div>
          <p className="eyebrow">Combat!</p>
          <h2>
            {pendingCombat.attackerSide} {pendingCombat.attackerProfileName} attacks {pendingCombat.defenderSide}{" "}
            {pendingCombat.defenderProfileName} at {coordinateLabel(pendingCombat.targetSquare)}
          </h2>
        </div>
        <strong>Auto-roll in {secondsRemaining}s</strong>
      </div>

      <div className="combat-roll-grid">
        <RollCard
          autoRolled={pendingCombat.attackerAutoRolled}
          buttonLabel={`Roll ${pendingCombat.attackerSide} Dice`}
          canRoll={canRollAttacker}
          dieIndex={pendingCombat.attackerDieIndex}
          isAttacker
          onRoll={() => onRoll(pendingCombat.attackerSide)}
          profile={pendingCombat.attackerProfile}
          profileName={pendingCombat.attackerProfileName}
          profileValue={pendingCombat.attackerProfileValue}
          side={pendingCombat.attackerSide}
        />
        <RollCard
          autoRolled={pendingCombat.defenderAutoRolled}
          buttonLabel={`Roll ${pendingCombat.defenderSide} Dice`}
          canRoll={canRollDefender}
          dieIndex={pendingCombat.defenderDieIndex}
          onRoll={() => onRoll(pendingCombat.defenderSide)}
          profile={pendingCombat.defenderProfile}
          profileName={pendingCombat.defenderProfileName}
          profileValue={pendingCombat.defenderProfileValue}
          side={pendingCombat.defenderSide}
        />
      </div>

      {pendingCombat.status === "bothRolled" && winner ? (
        <div className="combat-comparison">
          <strong>
            Final: {pendingCombat.attackerProfileValue} vs {pendingCombat.defenderProfileValue}
          </strong>
          {pendingCombat.attackerProfileValue === pendingCombat.defenderProfileValue ? <span>Tie: attacker wins.</span> : null}
          <span>{winner} wins. Resolving...</span>
        </div>
      ) : (
        <p className="combat-waiting">Waiting for dice rolls. Board play is paused until combat resolves.</p>
      )}
    </section>
  );
}

type RollCardProps = {
  autoRolled?: boolean;
  buttonLabel: string;
  canRoll: boolean;
  dieIndex?: number;
  isAttacker?: boolean;
  onRoll: () => void;
  profile: number[];
  profileName: string;
  profileValue?: number;
  side: PlayerSide;
};

function RollCard({
  autoRolled,
  buttonLabel,
  canRoll,
  dieIndex,
  isAttacker,
  onRoll,
  profile,
  profileName,
  profileValue,
  side,
}: RollCardProps) {
  const rolled = dieIndex !== undefined;

  return (
    <div className={`roll-card ${side.toLowerCase()}`}>
      <strong>
        {side} {isAttacker ? "attacker" : "defender"}: {profileName}
      </strong>
      <span>Profile: [{profile.join(", ")}]</span>
      <span>{rolled ? `Die roll: ${dieIndex + 1}` : "Die roll: waiting..."}</span>
      <span>{rolled ? `Profile value: ${profileValue}` : "Profile value: waiting..."}</span>
      {autoRolled ? <span className="auto-roll-note">Timed out. Auto-rolled.</span> : null}
      <button disabled={!canRoll || rolled} onClick={onRoll} type="button">
        {rolled ? "Rolled" : canRoll ? buttonLabel : "Waiting for opponent..."}
      </button>
    </div>
  );
}

function canRoll(pendingCombat: PendingCombat, side: PlayerSide, currentRoller: PlayerSide | "Both" | null): boolean {
  if (currentRoller === null) {
    return false;
  }
  if (currentRoller !== "Both" && currentRoller !== side) {
    return false;
  }
  return (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) ||
    (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined);
}
