import { coordinateLabel } from "../engine/board";
import { KingThreat } from "../engine/kingThreat";

type CheckWarningBannerProps = {
  threats: KingThreat[];
};

export function CheckWarningBanner({ threats }: CheckWarningBannerProps) {
  if (!threats.length) {
    return null;
  }

  const grouped = threats.reduce<Record<string, KingThreat[]>>((groups, threat) => {
    groups[threat.kingSide] = [...(groups[threat.kingSide] ?? []), threat];
    return groups;
  }, {});

  const messages = Object.entries(grouped).map(([side, sideThreats]) => {
    if (sideThreats.length === 1) {
      const threat = sideThreats[0];
      return `Warning: ${side} King can be attacked by ${threat.attackerSide} ${threat.attackerType} at ${coordinateLabel(threat.attackerSquare)}.`;
    }
    return `${side} King is in check from ${sideThreats.length} pieces.`;
  });

  return (
    <div className="check-warning-banner" role="status" aria-live="polite">
      {messages.join(" ")}
    </div>
  );
}
