import { GameState } from "../../engine/types";

type GameInfoPanelProps = {
  state: GameState;
  onReset: () => void;
};

export function GameInfoPanel({ state, onReset }: GameInfoPanelProps) {
  return (
    <section className="panel-block game-info-panel">
      <p className="eyebrow">Frontier Chess</p>
      <h1>Playtest Build</h1>
      <div className="info-grid">
        <span>Current player</span>
        <strong className={state.turn.toLowerCase()}>{state.winner ? `${state.winner} wins` : state.turn}</strong>
        <span>Turn</span>
        <strong>{state.turnNumber}</strong>
        <span>Status</span>
        <strong>{state.winner ? "Game over" : "In progress"}</strong>
      </div>
      <button className="reset-button" onClick={onReset} type="button">
        Reset standard game
      </button>
    </section>
  );
}
