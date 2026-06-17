import { TEST_FACTIONS } from "../../data/factions/testFactions";
import { Faction } from "../../engine/factions/factionTypes";
import { PlayerSide, SelectedFactions } from "../../engine/types";

type FactionPanelProps = {
  disabled?: boolean;
  onFactionChange: (side: PlayerSide, factionId: string) => void;
  selectedFactions: SelectedFactions;
};

export function FactionPanel({ disabled = false, onFactionChange, selectedFactions }: FactionPanelProps) {
  return (
    <section className="panel-block faction-panel">
      <h2>Factions</h2>
      <p className="muted-copy">Faction powers are data-only placeholders and do not affect gameplay yet.</p>
      <FactionSideSelector
        disabled={disabled}
        faction={findFaction(selectedFactions.Blue)}
        label="Blue faction"
        onChange={(factionId) => onFactionChange("Blue", factionId)}
        selectedFactionId={selectedFactions.Blue}
      />
      <FactionSideSelector
        disabled={disabled}
        faction={findFaction(selectedFactions.Red)}
        label="Red faction"
        onChange={(factionId) => onFactionChange("Red", factionId)}
        selectedFactionId={selectedFactions.Red}
      />
    </section>
  );
}

type FactionSideSelectorProps = {
  disabled: boolean;
  faction?: Faction;
  label: string;
  onChange: (factionId: string) => void;
  selectedFactionId: string | null;
};

function FactionSideSelector({ disabled, faction, label, onChange, selectedFactionId }: FactionSideSelectorProps) {
  return (
    <div className="faction-side">
      <label className="faction-select-field">
        <span>{label}</span>
        <select
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={selectedFactionId ?? ""}
        >
          {TEST_FACTIONS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      {faction ? <FactionSummary faction={faction} /> : null}
    </div>
  );
}

function FactionSummary({ faction }: { faction: Faction }) {
  return (
    <div className="faction-summary">
      <strong>{faction.name}</strong>
      <p>{faction.description}</p>
      <div className="faction-card-list">
        {faction.cards.map((card) => (
          <article className="faction-card" key={card.id}>
            <div className="faction-card-heading">
              <strong>{card.name}</strong>
              <span>{card.type}</span>
            </div>
            <dl>
              <div>
                <dt>Timing</dt>
                <dd>{card.timing}</dd>
              </div>
              <div>
                <dt>Implemented</dt>
                <dd>{card.implemented ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <p>{card.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function findFaction(factionId: string | null): Faction | undefined {
  return TEST_FACTIONS.find((faction) => faction.id === factionId);
}
