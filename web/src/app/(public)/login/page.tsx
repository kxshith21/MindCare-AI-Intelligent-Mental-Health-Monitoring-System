"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAppRole } from "@/lib/guards";
import { createSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Email/password login via Supabase Auth.
 *
 * The redirect target comes from `app_metadata.role` only (never
 * user_metadata). Users without a known role land on the patient area —
 * RLS shows them nothing until a role exists.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      const role = getAppRole(data.user);
      router.push(role === "psychologist" ? "/psychologist/dashboard" : "/patient/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Not a crisis service — if you are in immediate danger,
          contact local emergency services.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>
          No account yet?{" "}
          <Link href="/signup" className="underline">
            Create a patient account
          </Link>
        </span>
        <span>
          Psychologist?{" "}
          <Link href="/signup/psychologist" className="underline">
            Apply for a psychologist account
          </Link>
        </span>
      </div>
    </div>
  );
}
