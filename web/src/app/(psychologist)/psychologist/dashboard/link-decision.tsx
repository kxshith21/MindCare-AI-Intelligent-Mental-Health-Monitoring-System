"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Accept or decline a PENDING care link (psychologist side).
 *
 * - accept  -> status 'active'  (trigger: only the psychologist may do this)
 * - decline -> status 'revoked' (trigger stamps revoked_at; terminal)
 * Only `status` is written; the transition trigger rejects anything else.
 */
export function LinkDecision({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "accept" | "decline") {
    if (
      action === "decline" &&
      !window.confirm("Decline this invitation? The patient will be told it was declined.")
    ) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("care_links")
        .update({ status: action === "accept" ? "active" : "revoked" })
        .eq("id", linkId)
        .eq("status", "pending");
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => decide("accept")}
          disabled={busy !== null}
        >
          {busy === "accept" ? "Accepting…" : "Accept"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => decide("decline")}
          disabled={busy !== null}
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </Button>
      </span>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
