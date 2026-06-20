import { coordinateLabel } from "../../engine/board";
import { getPendingCombatFinalValue, getPendingCombatWinner } from "../../engine/pendingCombat";
import { CombatModifier, PendingCombat, PlayerSide } from "../../engine/types";

type CombatRollPanelProps = {
  pendingCombat?: PendingCombat;
  currentRoller?: PlayerSide | "Both" | null;
  resolveSecondsRemaining?: number;
  secondsRemaining: number;
  onRoll: (side: PlayerSide) => void;
  onPassGambit?: (side: PlayerSide) => void;
  onPlayGambit?: (side: PlayerSide) => void;
  onKeepBreakthrough?: (side: PlayerSide) => void;
  onUseBreakthrough?: (side: PlayerSide) => void;
};

export function CombatRollPanel({
  pendingCombat,
  currentRoller = "Both",
  resolveSecondsRemaining = 0,
  secondsRemaining,
  onRoll,
  onPassGambit,
  onPlayGambit,
  onKeepBreakthrough,
  onUseBreakthrough,
}: CombatRollPanelProps) {
  if (!pendingCombat) {
    return null;
  }

  const winner = getPendingCombatWinner(pendingCombat);
  const revealing = pendingCombat.status === "revealingResult";
  const gambitWindow = pendingCombat.status === "gambitWindow";
  const breakthroughWindow = pendingCombat.status === "breakthroughWindow";
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
        <strong>{revealing ? `Resolving in ${resolveSecondsRemaining}s` : `Auto-roll in ${secondsRemaining}s`}</strong>
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
          finalValue={pendingCombat.attackerDieIndex !== undefined ? getPendingCombatFinalValue(pendingCombat, "attacker") : undefined}
          modifiers={pendingCombat.attackerModifiers ?? []}
          revealing={revealing}
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
          finalValue={pendingCombat.defenderDieIndex !== undefined ? getPendingCombatFinalValue(pendingCombat, "defender") : undefined}
          modifiers={pendingCombat.defenderModifiers ?? []}
          revealing={revealing}
          side={pendingCombat.defenderSide}
        />
      </div>

      {gambitWindow ? (
        <div className="combat-comparison">
          <strong>Gambit window</strong>
          <span>Both dice are revealed. Eligible players may reroll their own die once.</span>
          <GambitAction side={pendingCombat.attackerSide} pendingCombat={pendingCombat} onPass={onPassGambit} onPlay={onPlayGambit} role="attacker" />
          <GambitAction side={pendingCombat.defenderSide} pendingCombat={pendingCombat} onPass={onPassGambit} onPlay={onPlayGambit} role="defender" />
        </div>
      ) : null}

      {breakthroughWindow && pendingCombat.breakthroughState ? (
        <div className="combat-comparison">
          <strong>Breakthrough Charge</strong>
          <span>{pendingCombat.breakthroughState.side} may reroll the attacking Knight's combat die once. The second result must be used.</span>
          <div className="gambit-actions">
            {onUseBreakthrough ? <button onClick={() => onUseBreakthrough(pendingCombat.breakthroughState!.side)} type="button">Reroll with Breakthrough Charge</button> : null}
            {onKeepBreakthrough ? <button onClick={() => onKeepBreakthrough(pendingCombat.breakthroughState!.side)} type="button">Keep result</button> : null}
          </div>
        </div>
      ) : null}

      {revealing && winner ? (
        <div className="combat-comparison">
          <span>Both players rolled.</span>
          <strong>
            Final: {getPendingCombatFinalValue(pendingCombat, "attacker")} vs {getPendingCombatFinalValue(pendingCombat, "defender")}
          </strong>
          {getPendingCombatFinalValue(pendingCombat, "attacker") === getPendingCombatFinalValue(pendingCombat, "defender") ? <span>Tie: attacker wins.</span> : null}
          <span>{winner} wins.</span>
          <span>Resolving in {resolveSecondsRemaining}s...</span>
        </div>
      ) : !gambitWindow && !breakthroughWindow ? (
        <p className="combat-waiting">Waiting for dice rolls. Board play is paused until combat resolves.</p>
      ) : null}
    </section>
  );
}

type RollCardProps = {
  autoRolled?: boolean;
  buttonLabel: string;
  canRoll: boolean;
  dieIndex?: number;
  finalValue?: number;
  isAttacker?: boolean;
  modifiers: CombatModifier[];
  onRoll: () => void;
  profile: number[];
  profileName: string;
  profileValue?: number;
  revealing: boolean;
  side: PlayerSide;
};

type GambitActionProps = {
  onPass?: (side: PlayerSide) => void;
  onPlay?: (side: PlayerSide) => void;
  pendingCombat: PendingCombat;
  role: "attacker" | "defender";
  side: PlayerSide;
};

function GambitAction({ onPass, onPlay, pendingCombat, role, side }: GambitActionProps) {
  const used = role === "attacker" ? pendingCombat.attackerUsedGambit : pendingCombat.defenderUsedGambit;
  const passed = role === "attacker" ? pendingCombat.attackerPassedGambit : pendingCombat.defenderPassedGambit;
  const originalDie = role === "attacker" ? pendingCombat.attackerOriginalDieIndex : pendingCombat.defenderOriginalDieIndex;
  const currentDie = role === "attacker" ? pendingCombat.attackerDieIndex : pendingCombat.defenderDieIndex;
  const originalValue = role === "attacker" ? pendingCombat.attackerOriginalProfileValue : pendingCombat.defenderOriginalProfileValue;
  const currentValue = role === "attacker" ? pendingCombat.attackerProfileValue : pendingCombat.defenderProfileValue;

  return (
    <div className="gambit-action">
      <strong>{side} {role}</strong>
      {used && originalDie !== undefined && currentDie !== undefined ? (
        <span>Gambit reroll: die face {originalDie + 1} → {currentDie + 1}, profile value {originalValue} → {currentValue}.</span>
      ) : passed ? (
        <span>Passed Gambit.</span>
      ) : (
        <span>Waiting for Gambit response.</span>
      )}
      {!used && !passed ? (
        <div className="gambit-actions">
          {onPlay ? <button onClick={() => onPlay(side)} type="button">Play Gambit</button> : null}
          {onPass ? <button onClick={() => onPass(side)} type="button">Pass</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function RollCard({
  autoRolled,
  buttonLabel,
  canRoll,
  dieIndex,
  finalValue,
  isAttacker,
  modifiers,
  onRoll,
  profile,
  profileName,
  profileValue,
  revealing,
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
      {rolled && modifiers.length ? (
        <div className="combat-modifier-list">
          <strong>Faction effect:</strong>
          {modifiers.map((modifier) => (
            <span key={`${modifier.source}-${modifier.pieceId}-${modifier.value}`}>
              {modifier.source} {formatSigned(modifier.value)} — {modifier.description}.
            </span>
          ))}
        </div>
      ) : null}
      {rolled ? <span>Final value: {finalValue ?? profileValue}</span> : null}
      {autoRolled ? <span className="auto-roll-note">Timed out. Auto-rolled.</span> : null}
      <button disabled={revealing || !canRoll || rolled} onClick={onRoll} type="button">
        {revealing ? "Result revealed — resolving..." : rolled ? "Rolled" : canRoll ? buttonLabel : "Waiting for opponent..."}
      </button>
    </div>
  );
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function canRoll(pendingCombat: PendingCombat, side: PlayerSide, currentRoller: PlayerSide | "Both" | null): boolean {
  if (currentRoller === null) {
    return false;
  }
  if (pendingCombat.status === "revealingResult") {
    return false;
  }
  if (currentRoller !== "Both" && currentRoller !== side) {
    return false;
  }
  return (side === pendingCombat.attackerSide && pendingCombat.attackerDieIndex === undefined) ||
    (side === pendingCombat.defenderSide && pendingCombat.defenderDieIndex === undefined);
}
