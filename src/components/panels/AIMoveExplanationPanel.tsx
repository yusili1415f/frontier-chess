import { coordinateLabel } from "../../engine/board";
import { getPieceAbbreviation } from "../../engine/data/classProfiles";
import { AIMoveExplanation } from "../../engine/history";

type AIMoveExplanationPanelProps = {
  explanation?: AIMoveExplanation;
};

export function AIMoveExplanationPanel({ explanation }: AIMoveExplanationPanelProps) {
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
        Board label: {getPieceAbbreviation(explanation.piece)} · {action}
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
