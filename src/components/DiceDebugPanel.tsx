import { ForcedDice } from "../engine/types";

type DiceDebugPanelProps = {
  forcedDice: ForcedDice | undefined;
  onForcedDiceChange: (forcedDice: ForcedDice) => void;
};

export function DiceDebugPanel({ forcedDice, onForcedDiceChange }: DiceDebugPanelProps) {
  return (
    <section className="panel-block forced-dice">
      <h2>Debug Only: Forced Dice</h2>
      <p>When set, combat uses these result values instead of random dice and the move log labels debug mode.</p>
      <label>
        Attacker forced result
        <select
          value={forcedDice?.attackerValue ?? ""}
          onChange={(event) => onForcedDiceChange({ ...forcedDice, attackerValue: parseForcedValue(event.target.value) })}
        >
          <option value="">Random</option>
          {resultOptions()}
        </select>
      </label>
      <label>
        Defender forced result
        <select
          value={forcedDice?.defenderValue ?? ""}
          onChange={(event) => onForcedDiceChange({ ...forcedDice, defenderValue: parseForcedValue(event.target.value) })}
        >
          <option value="">Random</option>
          {resultOptions()}
        </select>
      </label>
    </section>
  );
}

function resultOptions() {
  return [0, 1, 2, 3, 4, 5, 6].map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ));
}

function parseForcedValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}
