import { profileCombatWinRate } from "../../engine/simulation/balanceMetrics";
import { PieceTypeStats } from "../../engine/simulation/balanceTypes";

type BalancePieceStatsTableProps = {
  pieceStats: PieceTypeStats[];
};

export function BalancePieceStatsTable({ pieceStats }: BalancePieceStatsTableProps) {
  const activeStats = pieceStats.filter(
    (stats) =>
      stats.capturesMade > 0 ||
      stats.timesCaptured > 0 ||
      stats.combatsEntered > 0 ||
      stats.directCapturesMade > 0 ||
      stats.promotions > 0,
  );

  return (
    <div className="balance-subsection">
      <h3>Piece Statistics</h3>
      <div className="balance-table-wrap">
        <table className="balance-table">
          <thead>
            <tr>
              <th>Piece/Profile</th>
              <th>Captures</th>
              <th>Captured</th>
              <th>Combats</th>
              <th>Win %</th>
              <th>Direct</th>
              <th>Promotions</th>
            </tr>
          </thead>
          <tbody>
            {activeStats.map((stats) => (
              <tr key={stats.pieceType}>
                <td>{stats.pieceType}</td>
                <td>{stats.capturesMade}</td>
                <td>{stats.timesCaptured}</td>
                <td>{stats.combatsEntered}</td>
                <td>{profileCombatWinRate(stats).toFixed(0)}%</td>
                <td>{stats.directCapturesMade}</td>
                <td>{stats.promotions || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
