import { BalanceSummary } from "../../engine/simulation/balanceTypes";
import { BalanceFlagsPanel } from "./BalanceFlagsPanel";
import { BalancePieceStatsTable } from "./BalancePieceStatsTable";

type BalanceSummaryPanelProps = {
  summary: BalanceSummary;
};

export function BalanceSummaryPanel({ summary }: BalanceSummaryPanelProps) {
  return (
    <div className="simulation-result balance-result">
      <h3>Balance Summary</h3>
      <div className="balance-grid">
        <Metric label="Games" value={summary.gamesRun} />
        <Metric label="Blue wins" value={`${summary.blueWins} (${summary.blueWinRate.toFixed(1)}%)`} />
        <Metric label="Red wins" value={`${summary.redWins} (${summary.redWinRate.toFixed(1)}%)`} />
        <Metric label="Draws" value={`${summary.draws} (${summary.drawRate.toFixed(1)}%)`} />
        <Metric label="Average turns" value={summary.averageTurns.toFixed(1)} />
        <Metric label="Shortest / longest" value={`${summary.shortestGameTurns} / ${summary.longestGameTurns}`} />
        <Metric label="King captures" value={summary.kingCaptures} />
        <Metric label="Max-turn games" value={summary.maxTurnGames} />
        <Metric label="Avg combats" value={summary.averageCombatsPerGame.toFixed(1)} />
        <Metric label="Avg direct captures" value={summary.averageDirectCapturesPerGame.toFixed(1)} />
        <Metric label="Avg Cannon captures" value={summary.averageCannonCapturesPerGame.toFixed(1)} />
        <Metric label="Avg promotions" value={summary.averagePromotionsPerGame.toFixed(1)} />
      </div>

      <div className="balance-subsection">
        <h3>Combat</h3>
        <div className="balance-grid">
          <Metric label="Total combats" value={summary.combatStats.totalCombats} />
          <Metric label="Attacker wins" value={summary.combatStats.attackerWins} />
          <Metric label="Defender wins" value={summary.combatStats.defenderWins} />
          <Metric label="Attacker tie wins" value={summary.combatStats.attackerTieWins} />
          <Metric label="Attacker win rate" value={`${summary.combatStats.attackerWinRate.toFixed(1)}%`} />
        </div>
      </div>

      <div className="balance-subsection">
        <h3>Cannons</h3>
        <div className="balance-grid">
          <Metric label="Capture attempts" value={summary.cannonStats.capturesAttempted} />
          <Metric label="Successful captures" value={summary.cannonStats.capturesSuccessful} />
          <Metric label="Blue Cannon captures" value={summary.cannonStats.blueCaptures} />
          <Metric label="Red Cannon captures" value={summary.cannonStats.redCaptures} />
          <Metric label="Home direct captures" value={summary.cannonStats.directCapturesFromHome} />
          <Metric label="Outside-home combats" value={summary.cannonStats.combatCapturesOutsideHome} />
        </div>
      </div>

      <div className="balance-subsection">
        <h3>Promotions & Frontier</h3>
        <div className="balance-grid">
          <Metric label="Pawn promotions" value={summary.promotionStats.pawnPromotions} />
          <Metric label="Guard promotions" value={summary.promotionStats.guardPromotions} />
          <Metric label="Blue promotions" value={summary.promotionStats.bluePromotions} />
          <Metric label="Red promotions" value={summary.promotionStats.redPromotions} />
          <Metric label="Frontier captures" value={summary.frontierStats.capturesInFrontierZone} />
          <Metric label="Outside captures" value={summary.frontierStats.capturesOutsideFrontierZone} />
          <Metric label="Row 3 combats" value={summary.frontierStats.combatsByRow[3]} />
          <Metric label="Row 4 combats" value={summary.frontierStats.combatsByRow[4]} />
          <Metric label="Row 5 combats" value={summary.frontierStats.combatsByRow[5]} />
        </div>
      </div>

      <BalanceFlagsPanel flags={summary.balanceFlags} />
      <BalancePieceStatsTable pieceStats={summary.pieceStats} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
