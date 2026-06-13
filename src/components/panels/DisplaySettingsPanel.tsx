import { PieceLabelMode } from "../../engine/data/classProfiles";

type DisplaySettingsPanelProps = {
  pieceLabelMode: PieceLabelMode;
  onPieceLabelModeChange: (mode: PieceLabelMode) => void;
};

export function DisplaySettingsPanel({ pieceLabelMode, onPieceLabelModeChange }: DisplaySettingsPanelProps) {
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
    </section>
  );
}
