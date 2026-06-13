import { AIPlayOptions, AIStatus, GameMode, getAISideLabel, getHumanSideLabel } from "../../engine/ai/aiTurn";
import { GameState } from "../../engine/types";

type PlayModePanelProps = {
  state: GameState;
  gameMode: GameMode;
  aiStatus: AIStatus;
  options: AIPlayOptions;
  resultText: string;
  onGameModeChange: (gameMode: GameMode) => void;
  onOptionsChange: (options: AIPlayOptions) => void;
  onLetAIMoveNow: () => void;
  onSwitchSides: () => void;
  onNewHumanVsAI: () => void;
};

export function PlayModePanel({
  state,
  gameMode,
  aiStatus,
  options,
  resultText,
  onGameModeChange,
  onOptionsChange,
  onLetAIMoveNow,
  onSwitchSides,
  onNewHumanVsAI,
}: PlayModePanelProps) {
  return (
    <section className="panel-block play-mode-panel">
      <h2>Play Mode</h2>
      <label className="play-mode-field">
        Current mode
        <select value={gameMode} onChange={(event) => onGameModeChange(event.target.value as GameMode)}>
          <option value="human-vs-human">Human vs Human</option>
          <option value="human-blue-vs-ai-red">Human Blue vs Heuristic Red</option>
          <option value="ai-blue-vs-human-red">Heuristic Blue vs Human Red</option>
          <option value="ai-vs-ai">Heuristic vs Heuristic</option>
        </select>
      </label>
      <div className="info-grid">
        <span>Human side</span>
        <strong>{getHumanSideLabel(gameMode)}</strong>
        <span>AI side</span>
        <strong>{getAISideLabel(gameMode)}</strong>
        <span>Current player</span>
        <strong className={state.turn.toLowerCase()}>{state.winner ? `${state.winner} wins` : state.turn}</strong>
        <span>AI status</span>
        <strong>{aiStatus}</strong>
        <span>Result</span>
        <strong>{resultText}</strong>
      </div>
      <div className="play-options">
        <label>
          AI randomness
          <input
            max={1}
            min={0}
            step={0.05}
            type="number"
            value={options.heuristicRandomness}
            onChange={(event) => onOptionsChange({ ...options, heuristicRandomness: Number(event.target.value) })}
          />
        </label>
        <label>
          Top N
          <input
            min={1}
            type="number"
            value={options.topN}
            onChange={(event) => onOptionsChange({ ...options, topN: Number(event.target.value) })}
          />
        </label>
        <label>
          AI delay ms
          <input
            min={0}
            type="number"
            value={options.aiMoveDelayMs}
            onChange={(event) => onOptionsChange({ ...options, aiMoveDelayMs: Number(event.target.value) })}
          />
        </label>
        <label>
          Max turns
          <input
            min={0}
            type="number"
            value={options.maxTurns}
            onChange={(event) => onOptionsChange({ ...options, maxTurns: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="simulation-actions">
        <button onClick={onLetAIMoveNow} type="button">Let AI Move Now</button>
        <button onClick={onSwitchSides} type="button">Switch Sides</button>
        <button onClick={onNewHumanVsAI} type="button">New Human vs AI Game</button>
      </div>
    </section>
  );
}
