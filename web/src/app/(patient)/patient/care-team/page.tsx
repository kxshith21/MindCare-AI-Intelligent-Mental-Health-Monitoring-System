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
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";
import { ShareScopeSelect } from "./share-scope-select";

// Reads the session + rows per request — not statically prerendered.
export const instant = false;

interface CareLinkRow {
  id: string;
  psychologist_id: string;
  status: "pending" | "active" | "revoked";
  share_scope: "summary_only" | "full";
  invited_at: string;
  consented_at: string;
  revoked_at: string | null;
}

interface ProfileRow {
  id: string;
  display_name: string;
}

const STATUS_LABEL: Record<CareLinkRow["status"], string> = {
  pending: "Invitation sent",
  active: "Active",
  revoked: "Revoked",
};

/**
 * Patient care team: invite a verified psychologist by email, see link
 * status/scope, revoke. All reads go through RLS — a patient only ever sees
 * their own links and the profile rows of psychologists on those links.
 */
export default function CareTeamPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading your care team…" />}>
      <CareTeamContent />
    </Suspense>
  );
}

async function CareTeamContent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: linkRows, error: linksError } = await supabase
    .from("care_links")
    .select("id, psychologist_id, status, share_scope, invited_at, consented_at, revoked_at")
    .order("invited_at", { ascending: false });

  if (linksError) {
    throw new Error(`Could not load your care team: ${linksError.message}`);
  }
  const links = (linkRows ?? []) as CareLinkRow[];

  // Display names of the psychologists on these links (any status — the
  // profiles_select_linked_psychologist policy allows exactly this).
  const psychologistIds = [...new Set(links.map((l) => l.psychologist_id))];
  const names = new Map<string, string>();
  if (psychologistIds.length > 0) {
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", psychologistIds);
    if (profilesError) {
      throw new Error(`Could not load psychologist names: ${profilesError.message}`);
    }
    for (const row of (profileRows ?? []) as ProfileRow[]) {
      names.set(row.id, row.display_name);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Care team</h1>
        <p className="text-sm text-muted-foreground">
          Invite a verified psychologist by email. They only see your data after
          they accept and only to the scope you grant. You can revoke access at
          any time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a psychologist</CardTitle>
          <CardDescription>
            They receive a pending invitation; nothing is shared until they
            accept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your links</CardTitle>
          <CardDescription>
            {links.length === 0
              ? "You have not invited anyone yet."
              : `${links.length} link${links.length === 1 ? "" : "s"} on your account.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {links.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                      {names.get(link.psychologist_id) ?? "Psychologist"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABEL[link.status]} ·{" "}
                      {link.share_scope === "full"
                        ? "full access (notes, messages, answers)"
                        : "summary only (scores and mood)"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={link.status === "active" ? "default" : "secondary"}>
                      {STATUS_LABEL[link.status]}
                    </Badge>
                    {(link.status === "pending" || link.status === "active") && (
                      <ShareScopeSelect
                        linkId={link.id}
                        initialScope={link.share_scope}
                      />
                    )}
                    {(link.status === "pending" || link.status === "active") && (
                      <RevokeButton linkId={link.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Need help?{" "}
        <Link href="/patient/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
