import { Button } from "@/components/ui/button";
import { CrisisResources } from "@/components/crisis-resources";
import type { ApiError } from "@/lib/api";

interface ErrorStateProps {
  error: ApiError | Error | string;
  title?: string;
  retry?: () => void;
  /** Patient-facing failures always keep support information visible. */
  showCrisisResources?: boolean;
}

function messageFor(error: ApiError | Error | string): string {
  if (typeof error === "string") return error;
  if (error.name === "ApiError" && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function ErrorState({
  error,
  title = "We could not load this right now",
  retry,
  showCrisisResources = true,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col gap-4" role="alert">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{messageFor(error)}</p>
        {retry ? (
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </div>
      {showCrisisResources ? <CrisisResources /> : null}
    </div>
  );
}
