import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = "Loading…",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn("flex items-center gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <span className="size-3 animate-pulse rounded-full bg-primary" aria-hidden="true" />
      {label}
    </div>
  );
}
