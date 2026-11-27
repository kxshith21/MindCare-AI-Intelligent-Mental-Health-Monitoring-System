import { cn } from "@/lib/utils";

export const SCREENING_QUESTION_DISCLAIMER =
  "These are screening questions used by clinicians. They are not a diagnosis.";
export const SCREENING_SCORE_DISCLAIMER =
  "Screening scores can change from week to week and are not a diagnosis.";

interface DisclaimerProps {
  variant?: "questions" | "scores" | "general";
  className?: string;
}

/** Short, consistent safety wording. Never implies a clinical conclusion. */
export function Disclaimer({
  variant = "general",
  className,
}: DisclaimerProps) {
  const text =
    variant === "questions"
      ? SCREENING_QUESTION_DISCLAIMER
      : variant === "scores"
        ? SCREENING_SCORE_DISCLAIMER
        : "MindCare AI offers reflection and check-ins. It is not a crisis service or a substitute for professional care.";

  return (
    <p className={cn("text-xs text-muted-foreground", className)} role="note">
      {text}
    </p>
  );
}
