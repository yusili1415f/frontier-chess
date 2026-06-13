type ReplayPanelProps = {
  active: boolean;
  index: number;
  latestIndex: number;
  onGoStart: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoLatest: () => void;
  onReturnLive: () => void;
};

export function ReplayPanel({
  active,
  index,
  latestIndex,
  onGoStart,
  onPrevious,
  onNext,
  onGoLatest,
  onReturnLive,
}: ReplayPanelProps) {
  return (
    <section className={`panel-block replay-panel ${active ? "active" : ""}`}>
      <h2>Replay</h2>
      <p className="muted-copy">
        {active ? `Replay Mode: move ${index} of ${latestIndex}` : `Live game: ${latestIndex} recorded moves`}
      </p>
      <div className="simulation-actions replay-actions">
        <button disabled={index === 0} onClick={onGoStart} type="button">Go to start</button>
        <button disabled={index === 0} onClick={onPrevious} type="button">Previous move</button>
        <button disabled={index >= latestIndex} onClick={onNext} type="button">Next move</button>
        <button disabled={index >= latestIndex && !active} onClick={onGoLatest} type="button">Go to latest</button>
        <button disabled={!active} onClick={onReturnLive} type="button">Return to live game</button>
      </div>
    </section>
  );
}
