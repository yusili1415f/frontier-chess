import { BatchSimulationSummary, ScoredMoveChoice, SimulationResult } from "../../engine/simulation/simulationTypes";
import { coordinateLabel } from "../../engine/board";

export type AiMode = "random" | "heuristic";

type SimulationPanelProps = {
  aiMode: AiMode;
  lastResult?: SimulationResult;
  batchSummary?: BatchSimulationSummary;
  lastHeuristicChoice?: ScoredMoveChoice;
  onAiModeChange: (mode: AiMode) => void;
  onRunOne: () => void;
  onRunBatch: (games: number) => void;
  onStep: () => void;
  onAutoPlay: () => void;
};

export function SimulationPanel({
  aiMode,
  lastResult,
  batchSummary,
  lastHeuristicChoice,
  onAiModeChange,
  onRunOne,
  onRunBatch,
  onStep,
  onAutoPlay,
}: SimulationPanelProps) {
  return (
    <section className="panel-block simulation-panel">
      <h2>Simulation</h2>
      <label className="ai-mode-select">
        AI Mode
        <select value={aiMode} onChange={(event) => onAiModeChange(event.target.value as AiMode)}>
          <option value="random">Random AI</option>
          <option value="heuristic">Heuristic AI</option>
        </select>
      </label>
      <div className="simulation-actions">
        <button onClick={onStep} type="button">Step {aiMode === "heuristic" ? "Heuristic" : "Random"} AI move</button>
        <button onClick={onRunOne} type="button">Run 1 {aiMode} game</button>
        <button onClick={() => onRunBatch(10)} type="button">Run 10 {aiMode} games</button>
        <button onClick={() => onRunBatch(100)} type="button">Run 100 {aiMode} games</button>
        <button onClick={onAutoPlay} type="button">Auto-play {aiMode} until end</button>
      </div>

      {lastHeuristicChoice ? (
        <div className="simulation-result">
          <h3>Heuristic Choice</h3>
          <span>
            AI chose: {lastHeuristicChoice.pieceId} → {coordinateLabel(lastHeuristicChoice.move.to)}
          </span>
          <span>Score: {lastHeuristicChoice.score.total.toFixed(2)}</span>
          <ol>
            {lastHeuristicChoice.score.reasons.slice(0, 6).map((reason) => (
              <li key={`${reason.label}-${reason.value}`}>
                {reason.label}: {reason.value > 0 ? "+" : ""}
                {reason.value.toFixed(2)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {lastResult ? (
        <div className="simulation-result">
          <h3>Last Game</h3>
          <span>Winner: {lastResult.winner ?? "None"}</span>
          <span>Reason: {lastResult.reason}</span>
          <span>Turns: {lastResult.totalTurns}</span>
          <ol>
            {lastResult.moves.slice(-10).map((move, index) => (
              <li key={`${move.turn}-${move.pieceId}-${index}`}>{move.summary}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {batchSummary ? (
        <div className="simulation-result">
          <h3>Batch Summary</h3>
          <span>Games: {batchSummary.games}</span>
          <span>Blue wins: {batchSummary.blueWins}</span>
          <span>Red wins: {batchSummary.redWins}</span>
          <span>Draws / unresolved: {batchSummary.draws}</span>
          <span>Average turns: {batchSummary.averageTurns.toFixed(1)}</span>
          <span>Shortest game: {batchSummary.shortestGame}</span>
          <span>Longest game: {batchSummary.longestGame}</span>
          <span>King captures: {batchSummary.kingCaptures}</span>
          <span>Combats: {batchSummary.combatCount}</span>
          <span>Direct captures: {batchSummary.directCaptureCount}</span>
          <span>Promotions: {batchSummary.promotionCount}</span>
          <span>Avg combats: {batchSummary.averageCombatCount.toFixed(1)}</span>
          <span>Avg direct captures: {batchSummary.averageDirectCaptureCount.toFixed(1)}</span>
          <span>Avg promotions: {batchSummary.averagePromotionCount.toFixed(1)}</span>
          <span>Avg King capture turn: {batchSummary.averageKingCaptureTurn?.toFixed(1) ?? "n/a"}</span>
        </div>
      ) : null}
    </section>
  );
}
