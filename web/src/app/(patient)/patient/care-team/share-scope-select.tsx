"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Scope = "summary_only" | "full";

/** Changes only `share_scope`; the DB trigger rejects mixed status/scope writes. */
export function ShareScopeSelect({
  linkId,
  initialScope,
  disabled,
}: {
  linkId: string;
  initialScope: Scope;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: Scope) {
    if (next === scope) return;
    if (
      next === "full" &&
      !window.confirm(
        "Grant full access? This also shares chat messages, questionnaire answers and clinician notes.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("care_links")
        .update({ share_scope: next })
        .eq("id", linkId);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setScope(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Scope
        <select
          value={scope}
          disabled={busy || disabled}
          onChange={(event) => void change(event.target.value as Scope)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          <option value="summary_only">Summary only</option>
          <option value="full">Full</option>
        </select>
      </label>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
