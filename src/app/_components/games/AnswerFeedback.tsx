type Variant = "correct" | "close" | "wrong" | "timeout";

const STYLES: Record<Variant, { bg: string; border: string; text: string; label: string; icon: string }> = {
  correct: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    label: "Correct",
    icon: "✓",
  },
  close: {
    bg: "bg-amber-400/15",
    border: "border-amber-400/40",
    text: "text-amber-300",
    label: "Close enough",
    icon: "≈",
  },
  wrong: {
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
    text: "text-rose-300",
    label: "Not quite",
    icon: "✕",
  },
  timeout: {
    bg: "bg-zinc-500/15",
    border: "border-zinc-500/40",
    text: "text-zinc-300",
    label: "Time's up",
    icon: "⏱",
  },
};

export function AnswerFeedback({
  variant,
  correctAnswer,
  meta,
  funFact,
  pointsEarned,
}: {
  variant: Variant;
  correctAnswer: string;
  meta?: string;
  funFact?: string;
  pointsEarned: number;
}) {
  const s = STYLES[variant];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border ${s.border} ${s.bg} p-4`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`flex items-center gap-2 font-bold ${s.text}`}>
          <span aria-hidden className="text-xl">
            {s.icon}
          </span>
          <span>{s.label}</span>
        </div>
        {pointsEarned > 0 && (
          <div className="font-mono text-sm font-semibold text-foreground">
            +{pointsEarned}
          </div>
        )}
      </div>
      <div className="mt-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-(--muted)">
          answer
        </div>
        <div className="mt-0.5 text-base font-semibold">{correctAnswer}</div>
        {meta && <div className="text-xs text-(--muted)">{meta}</div>}
      </div>
      {funFact && (
        <div className="mt-3 border-t border-(--border)/60 pt-2 text-xs text-(--muted)">
          {funFact}
        </div>
      )}
    </div>
  );
}
