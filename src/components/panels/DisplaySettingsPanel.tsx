import { CombatRollMode, MobileBoardLockMode } from "../../engine/types";
import { PieceLabelMode } from "../../engine/data/classProfiles";

type DisplaySettingsPanelProps = {
  combatRollMode: CombatRollMode;
  mobileBoardLockMode: MobileBoardLockMode;
  onCombatRollModeChange: (mode: CombatRollMode) => void;
  onMobileBoardLockModeChange: (mode: MobileBoardLockMode) => void;
  pieceLabelMode: PieceLabelMode;
  onPieceLabelModeChange: (mode: PieceLabelMode) => void;
};

export function DisplaySettingsPanel({
  combatRollMode,
  mobileBoardLockMode,
  onCombatRollModeChange,
  onMobileBoardLockModeChange,
  pieceLabelMode,
  onPieceLabelModeChange,
}: DisplaySettingsPanelProps) {
  return (
    <section className="panel-block display-settings-panel">
      <h2>Display Settings</h2>
      <label className="display-setting-field">
        Piece Labels
        <select value={pieceLabelMode} onChange={(event) => onPieceLabelModeChange(event.target.value as PieceLabelMode)}>
          <option value="english">English: K / R / N / B / C / G / P</option>
          <option value="traditionalChinese">繁體中文: 王 / 車 / 馬 / 相 / 炮 / 士 / 兵</option>
        </select>
      </label>
      <label className="display-setting-field">
        Combat Dice
        <select value={combatRollMode} onChange={(event) => onCombatRollModeChange(event.target.value as CombatRollMode)}>
          <option value="automatic">Automatic</option>
          <option value="manual">Manual Roll</option>
        </select>
      </label>
      <label className="display-setting-field mobile-board-lock-setting">
        Lock Board While Scrolling
        <select value={mobileBoardLockMode} onChange={(event) => onMobileBoardLockModeChange(event.target.value as MobileBoardLockMode)}>
          <option value="locked">On</option>
          <option value="unlocked">Off</option>
        </select>
      </label>
    </section>
  );
}
