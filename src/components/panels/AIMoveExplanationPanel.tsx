import { coordinateLabel } from "../../engine/board";
import { getPieceDisplayLabel, PieceLabelMode } from "../../engine/data/classProfiles";
import { AIMoveExplanation } from "../../engine/history";

type AIMoveExplanationPanelProps = {
  explanation?: AIMoveExplanation;
  labelMode: PieceLabelMode;
};

export function AIMoveExplanationPanel({ explanation, labelMode }: AIMoveExplanationPanelProps) {
  if (!explanation) {
    return (
      <section className="panel-block ai-explanation-panel">
        <h2>AI Move</h2>
        <p className="muted-copy">No AI move yet.</p>
      </section>
    );
  }

  const action = explanation.target ? `captures ${explanation.target.side} ${explanation.target.type}` : "moves";

  return (
    <section className="panel-block ai-explanation-panel">
      <h2>AI Move</h2>
      <p>
        <strong>
          {explanation.side} {explanation.piece.type} {coordinateLabel(explanation.from)} → {coordinateLabel(explanation.to)}
        </strong>
      </p>
      <p className="muted-copy">
        Board label: {getPieceDisplayLabel(explanation.piece, labelMode)} · {action}
      </p>
      <p className="muted-copy">Score: {explanation.score.total.toFixed(2)}</p>
      <ol>
        {explanation.score.reasons.slice(0, 6).map((reason) => (
          <li key={`${reason.label}-${reason.value}`}>
            {reason.label}: {reason.value > 0 ? "+" : ""}
            {reason.value.toFixed(2)}
          </li>
        ))}
      </ol>
    </section>
  );
}
