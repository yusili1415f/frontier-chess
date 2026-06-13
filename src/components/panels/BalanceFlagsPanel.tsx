import { BalanceFlag } from "../../engine/simulation/balanceTypes";

type BalanceFlagsPanelProps = {
  flags: BalanceFlag[];
};

export function BalanceFlagsPanel({ flags }: BalanceFlagsPanelProps) {
  return (
    <div className="balance-subsection">
      <h3>Balance Flags</h3>
      <ul className="balance-flags">
        {flags.map((flag) => (
          <li className={`balance-flag ${flag.severity}`} key={flag.label}>
            {flag.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
