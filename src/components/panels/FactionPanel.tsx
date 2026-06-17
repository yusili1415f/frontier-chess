import { TEST_FACTIONS } from "../../data/factions/testFactions";

export function FactionPanel() {
  return (
    <section className="panel-block faction-panel">
      <h2>Factions</h2>
      <p className="muted-copy">Faction rules are scaffolded for testing and are currently inactive.</p>
      <div className="faction-list">
        {TEST_FACTIONS.map((faction) => (
          <article className="faction-item" key={faction.id}>
            <strong>{faction.name}</strong>
            <span>{faction.summary}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
