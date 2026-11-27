"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const CONSENT_DOCUMENT_VERSION = "draft-2026-11-27";

/**
 * Patient signup — the ONLY client-facing signup.
 *
 * There is deliberately no role field: `handle_new_user` reads
 * `app_metadata.role`, which clients cannot write, and falls back to
 * 'patient'. A client-supplied `role` inside user_metadata is ignored
 * (RLS test 3.4).
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [region, setRegion] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!legalAccepted || !ageConfirmed) {
      setError(
        "Please accept the terms and privacy notice, acknowledge the crisis notice, and confirm you are 18 or older.",
      );
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName.trim(),
            // optional; the trigger normalises anything invalid to null
            ...(region.trim() ? { region: region.trim().toUpperCase() } : {}),
            terms_accepted: true,
            privacy_accepted: true,
            crisis_notice_acknowledged: true,
            age_18_plus: true,
            consent_document_version: CONSENT_DOCUMENT_VERSION,
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!data.session) {
        // Email confirmation is disabled on local Supabase; keep the branch
        // for deployments that enable it.
        setNeedsConfirm(true);
        return;
      }
      router.push("/patient/dashboard");
    } finally {
      setBusy(false);
    }
  }

  if (needsConfirm) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Confirm your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>. Open it to
          finish creating your account.
        </p>
        <Link href="/login" className="text-sm underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Patient accounts get mood check-ins and a supportive AI chat. Your
          data is shared with a psychologist only if you invite them.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Display name
          <input
            required
            maxLength={120}
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Region <span className="text-muted-foreground">(optional, e.g. US)</span>
          <input
            maxLength={2}
            autoComplete="country"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Two-letter code"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              checked={legalAccepted}
              onChange={(e) => setLegalAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I accept the Terms and Privacy notice and acknowledge that MindCare
              AI is not a crisis service.
            </span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            Read the{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>
            ,{" "}
            <Link href="/privacy" className="underline">
              Privacy notice
            </Link>{" "}
            and{" "}
            <Link href="/safety" className="underline">
              Safety
            </Link>{" "}
            information before continuing.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-0.5"
            />
            <span>I confirm that I am 18 or older.</span>
          </label>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </Button>
      </form>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </span>
        <span>
          Are you a psychologist?{" "}
          <Link href="/signup/psychologist" className="underline">
            Apply for a psychologist account
          </Link>
        </span>
      </div>
    </div>
  );
}
