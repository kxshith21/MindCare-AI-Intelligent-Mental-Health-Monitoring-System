"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function PatientSettingsPage() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove() {
    if (confirmation !== "DELETE") return;
    if (!window.confirm("Permanently delete your account and all of its data?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/goodbye");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not delete the account."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your MindCare account.
        </p>
      </div>

      {error ? <ErrorState error={error} /> : null}

      <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-5">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          This permanently removes your check-ins, chats, care-team links,
          clinician notes and your sign-in account. It cannot be undone.
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          Type DELETE to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <Button
          type="button"
          variant="destructive"
          className="self-start"
          disabled={busy || confirmation !== "DELETE"}
          onClick={() => void remove()}
        >
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </section>
    </div>
  );
}
