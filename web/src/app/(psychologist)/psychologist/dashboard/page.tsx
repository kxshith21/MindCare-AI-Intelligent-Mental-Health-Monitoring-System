import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingState } from "@/components/loading-state";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { LinkDecision } from "./link-decision";
import { RiskQueue } from "./risk-queue";

// Reads the session + rows per request — not statically prerendered.
export const instant = false;

interface CareLinkRow {
  id: string;
  patient_id: string;
  status: "pending" | "active" | "revoked";
  share_scope: "summary_only" | "full";
  invited_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
}

/**
 * Verified psychologist dashboard: pending invitations (accept/decline) and
 * the active patient list. Patients on PENDING links are deliberately shown
 * without a name — the profiles policy only reveals patients with an ACTIVE
 * link (consent has not been established yet).
 */
export default function PsychologistDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your patients…" />}>
      <PsychologistDashboardContent />
    </Suspense>
  );
}

async function PsychologistDashboardContent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: linkRows, error: linksError } = await supabase
    .from("care_links")
    .select("id, patient_id, status, share_scope, invited_at")
    .order("invited_at", { ascending: false });

  if (linksError) {
    throw new Error(`Could not load your links: ${linksError.message}`);
  }
  const links = (linkRows ?? []) as CareLinkRow[];
  const pending = links.filter((l) => l.status === "pending");
  const active = links.filter((l) => l.status === "active");

  // Display names of ACTIVE patients (RLS: profiles_select_linked_patient).
  const activeIds = active.map((l) => l.patient_id);
  const names = new Map<string, string>();
  if (activeIds.length > 0) {
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", activeIds);
    if (profilesError) {
      throw new Error(`Could not load patient names: ${profilesError.message}`);
    }
    for (const row of (profileRows ?? []) as ProfileRow[]) {
      names.set(row.id, row.display_name);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Your patients</h1>
        <p className="text-sm text-muted-foreground">
          You only see patients who invited you and whose link you accepted —
          and only to the scope they granted.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "No invitations waiting."
              : "Accept to start seeing this patient's shared data."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to review.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      Patient invitation
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Requested scope:{" "}
                      {link.share_scope === "full" ? "full access" : "summary only"}
                    </span>
                  </div>
                  <LinkDecision linkId={link.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active patients</CardTitle>
          <CardDescription>
            {active.length === 0
              ? "No active links yet."
              : `${active.length} patient${active.length === 1 ? "" : "s"} sharing data with you.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {active.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/psychologist/patients/${link.patient_id}`}
                      className="text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {names.get(link.patient_id) ?? "Patient"}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {link.share_scope === "full"
                        ? "full access (notes, messages, answers)"
                        : "summary only (scores and mood)"}
                    </span>
                  </div>
                  <Badge variant="default">Active</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RiskQueue />
    </div>
  );
}
