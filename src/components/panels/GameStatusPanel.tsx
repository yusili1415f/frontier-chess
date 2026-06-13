import { AIStatus, GameMode, getAISideLabel, getHumanSideLabel } from "../../engine/ai/aiTurn";
import { GameState } from "../../engine/types";

type GameStatusPanelProps = {
  state: GameState;
  gameMode: GameMode;
  aiStatus: AIStatus;
  replayActive: boolean;
  resultText: string;
  reachedMaxTurns: boolean;
  playOutcome?: string;
};

export function GameStatusPanel({
  state,
  gameMode,
  aiStatus,
  replayActive,
  resultText,
  reachedMaxTurns,
  playOutcome,
}: GameStatusPanelProps) {
  const status = replayActive ? "Replay mode" : state.winner ? "Game over" : aiStatus === "thinking" ? "AI thinking" : "Live";
  const reason = state.winner ? "King captured" : reachedMaxTurns ? "Max turns reached" : playOutcome === "Draw / no legal moves" ? "No legal moves" : "n/a";

  return (
    <section className="panel-block game-status-panel">
      <h2>Game Status</h2>
      <div className="info-grid">
        <span>Current mode</span>
        <strong>{formatMode(gameMode)}</strong>
        <span>Current player</span>
        <strong className={state.turn.toLowerCase()}>{state.turn}</strong>
        <span>Human side</span>
        <strong>{getHumanSideLabel(gameMode)}</strong>
        <span>AI side</span>
        <strong>{getAISideLabel(gameMode)}</strong>
        <span>Turn number</span>
        <strong>{state.turnNumber}</strong>
        <span>Game status</span>
        <strong>{status}</strong>
        <span>Winner</span>
        <strong>{state.winner ?? "None"}</strong>
        <span>Reason</span>
        <strong>{reason}</strong>
        <span>Result</span>
        <strong>{resultText}</strong>
      </div>
    </section>
  );
}

function formatMode(gameMode: GameMode): string {
  switch (gameMode) {
    case "human-vs-human":
      return "Human vs Human";
    case "human-blue-vs-ai-red":
      return "Human Blue vs Heuristic Red";
    case "ai-blue-vs-human-red":
      return "Heuristic Blue vs Human Red";
    case "ai-vs-ai":
      return "Heuristic vs Heuristic";
  }
}
