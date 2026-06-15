import { LastMoveHighlight } from "../engine/lastMoveHighlight";

type LastActionBannerProps = {
  highlight: LastMoveHighlight;
};

export function LastActionBanner({ highlight }: LastActionBannerProps) {
  if (highlight.kind === "none") {
    return null;
  }

  return (
    <div className={`last-action-banner ${highlight.kind}`}>
      {highlight.summary}
    </div>
  );
}
