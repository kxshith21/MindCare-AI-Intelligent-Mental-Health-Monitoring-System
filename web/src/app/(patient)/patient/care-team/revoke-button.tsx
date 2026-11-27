"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Revokes a pending or active care link (patient side).
 *
 * Only `status` is written — the `care_links_before_update` trigger stamps
 * `revoked_at` and rejects any ownership/scope tampering. Revocation is
 * terminal: the link freezes and the psychologist loses access immediately.
 */
export function RevokeButton({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    if (!window.confirm("Revoke this link? They will lose access immediately.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase
        .from("care_links")
        .update({ status: "revoked" })
        .eq("id", linkId)
        .in("status", ["pending", "active"]);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRevoke}
        disabled={busy}
      >
        {busy ? "Revoking…" : "Revoke"}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
