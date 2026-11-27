import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppRole } from "@/lib/guards";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Reads the session + verification state per request — not static.
export const instant = false;

const NAV = [{ href: "/psychologist/dashboard", label: "Dashboard" }];

/**
 * Verified-only gate for every /psychologist/* route:
 * - no session            -> /login (proxy also catches this; defensive here)
 * - role != psychologist  -> their own area
 * - verified = false      -> "awaiting verification" screen, NO patient data
 * (RLS independently denies everything to unverified accounts — RLS test 4)
 */
async function requireVerifiedPsychologist() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (getAppRole(user) !== "psychologist") redirect("/patient/dashboard");

  const { data: profile } = await supabase
    .from("psychologist_profiles")
    .select("verified")
    .eq("user_id", user.id)
    .maybeSingle();

  return { verified: profile?.verified === true };
}

export default async function PsychologistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { verified } = await requireVerifiedPsychologist();

  if (!verified) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b bg-background">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tracking-tight">MindCare AI</span>
              <Badge variant="secondary">Psychologist</Badge>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Account awaiting verification</CardTitle>
              <CardDescription>
                Your license is being reviewed by the MindCare team. You can
                log in, but no patient data is visible until your account is
                verified. Verification happens manually — see docs/RLS.md.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/psychologist/dashboard"
              className="text-sm font-semibold tracking-tight"
            >
              MindCare AI
            </Link>
            <Badge variant="secondary">Psychologist</Badge>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
