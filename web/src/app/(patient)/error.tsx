"use client";

import { ErrorState } from "@/components/error-state";

/** Patient error boundary: support resources render even if a screen crashes. */
export default function PatientError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // Do not log `error`: it may contain message text from a failed request.
  void error;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <ErrorState
        error="This screen could not be shown right now."
        title="We hit a problem"
        retry={retry}
        showCrisisResources
      />
    </div>
  );
}
