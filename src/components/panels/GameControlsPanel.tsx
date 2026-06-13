type GameControlsPanelProps = {
  canUndo: boolean;
  onUndo: () => void;
  onNewHumanVsAI: () => void;
  onNewHumanVsHuman: () => void;
  onResetStandard: () => void;
  onResetScenario: () => void;
};

export function GameControlsPanel({
  canUndo,
  onUndo,
  onNewHumanVsAI,
  onNewHumanVsHuman,
  onResetStandard,
  onResetScenario,
}: GameControlsPanelProps) {
  return (
    <section className="panel-block game-controls-panel">
      <h2>Game Controls</h2>
      <div className="simulation-actions">
        <button disabled={!canUndo} onClick={onUndo} type="button">Undo</button>
        <button onClick={onNewHumanVsAI} type="button">New Human vs AI Game</button>
        <button onClick={onNewHumanVsHuman} type="button">New Human vs Human Game</button>
        <button onClick={onResetStandard} type="button">Reset to Standard Setup</button>
        <button onClick={onResetScenario} type="button">Reset Current Scenario</button>
      </div>
    </section>
  );
}
