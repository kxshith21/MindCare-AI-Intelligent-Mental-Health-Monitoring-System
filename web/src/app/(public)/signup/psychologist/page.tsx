"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api";

interface PsychologistSignupResponse {
  user_id: string;
  email: string;
  role: string;
  verified: boolean;
}

/**
 * Psychologist application — posts to the FastAPI endpoint
 * `POST /auth/psychologist-signup`, which creates the account server-side
 * with `app_metadata.role = 'psychologist'` (clients can never assign the
 * role themselves). The account starts UNVERIFIED: no patient data is
 * visible until an admin verifies it (docs/RLS.md).
 */
export default function PsychologistSignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PsychologistSignupResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await apiPost<PsychologistSignupResponse>(
        "/auth/psychologist-signup",
        {
          email,
          password,
          display_name: displayName.trim(),
          license_no: licenseNo.trim(),
          ...(region.trim() ? { region: region.trim().toUpperCase() } : {}),
        },
      );
      setCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Application received</h1>
        <p className="text-sm text-muted-foreground">
          The account for <strong>{created.email}</strong> has been created and
          is <strong>awaiting verification</strong>. A MindCare administrator
          verifies your license before you can see any patient data — you can
          already log in, but the dashboard will stay locked until then.
        </p>
        <Link href="/login" className="text-sm underline">
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Psychologist account</h1>
        <p className="text-sm text-muted-foreground">
          For licensed psychologists. Accounts are manually verified before any
          patient data becomes visible.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Full name
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
          License number
          <input
            required
            maxLength={64}
            value={licenseNo}
            onChange={(e) => setLicenseNo(e.target.value)}
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
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Apply"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Looking for a patient account?{" "}
        <Link href="/signup" className="underline">
          Sign up here
        </Link>
      </p>
    </div>
  );
}
