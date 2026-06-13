import { SCENARIOS, ScenarioId } from "../engine/scenarios";

type ScenarioPanelProps = {
  onScenario: (id: ScenarioId) => void;
};

export function ScenarioPanel({ onScenario }: ScenarioPanelProps) {
  const groups = ["Standard", "Cannon tests", "Promotion tests", "Combat tests"] as const;

  return (
    <section className="panel-block scenario-panel">
      <h2>Scenario Tools</h2>
      {groups.map((group) => (
        <div className="scenario-group" key={group}>
          <h3>{group}</h3>
          <div className="scenario-list">
            {SCENARIOS.filter((scenario) => scenario.group === group).map((scenario) => (
              <button key={scenario.id} onClick={() => onScenario(scenario.id)} type="button">
                <strong>{scenario.name}</strong>
                <span>{scenario.description}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
