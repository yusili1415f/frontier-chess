import { useState } from "react";

export function RulesReferencePanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel-block rules-reference">
      <button className="collapse-button" onClick={() => setOpen((value) => !value)} type="button">
        <span>Rules Reference</span>
        <strong>{open ? "−" : "+"}</strong>
      </button>
      {open ? (
        <ul>
          <li>Frontier Zone: rows 3-5.</li>
          <li>Frontier Line: row 4.</li>
          <li>Capture into the Frontier Zone triggers dice combat.</li>
          <li>Attacker wins ties.</li>
          <li>Cannon captures only with exactly 1 screen.</li>
          <li>Cannon home capture is direct.</li>
          <li>Pawn/Guard promotion is permanent.</li>
          <li>Promoted Pawn uses FrontierPawn profile.</li>
          <li>Promoted Guard uses FrontierGuard profile.</li>
        </ul>
      ) : null}
    </section>
  );
}
