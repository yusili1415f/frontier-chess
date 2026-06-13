import { GameHistoryEntry, GameSnapshot } from "./history";

export type ReplayState = {
  active: boolean;
  index: number;
};

export function createReplaySnapshots(initialSnapshot: GameSnapshot, entries: GameHistoryEntry[]): GameSnapshot[] {
  return [initialSnapshot, ...entries.map((entry) => entry.after)];
}

export function clampReplayIndex(index: number, snapshots: GameSnapshot[]): number {
  return Math.max(0, Math.min(index, Math.max(0, snapshots.length - 1)));
}

export function getReplaySnapshot(
  replay: ReplayState,
  initialSnapshot: GameSnapshot,
  entries: GameHistoryEntry[],
): GameSnapshot {
  const snapshots = createReplaySnapshots(initialSnapshot, entries);
  return snapshots[clampReplayIndex(replay.index, snapshots)];
}
