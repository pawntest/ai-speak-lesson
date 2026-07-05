/**
 * StageDots — gentle mastery indicator (D5/D7): four dots, no scores.
 */
import type { MasteryStage } from "../../shared/types";

export default function StageDots({ stage }: { stage: MasteryStage }) {
  return (
    <span className="stage-dots" role="img" aria-label={`Mastery stage ${stage + 1} / 4`}>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i <= stage ? "dot dot-on" : "dot"} />
      ))}
    </span>
  );
}
