"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

interface InviteResult {
  status: string;
  message: string;
}

/**
 * Invites a psychologist by email via the `invite_psychologist` SECURITY
 * DEFINER RPC. The database returns the SAME generic response whether or not
 * a verified psychologist matches the address (anti-enumeration) — the
 * success copy below reflects that deliberately.
 */
export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<"summary_only" | "full">("summary_only");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: rpcError } = await supabase.rpc("invite_psychologist", {
        p_email: email.trim(),
        p_share_scope: scope,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setResult(data as InviteResult);
      setEmail("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        Psychologist email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="therapist@example.com"
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        What they may see
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as "summary_only" | "full")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="summary_only">
            Summary only — scores and mood (default)
          </option>
          <option value="full">
            Full — also notes, chat messages, questionnaire answers
          </option>
        </select>
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="text-sm text-muted-foreground" role="status">
          {result.message}
        </p>
      )}
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
