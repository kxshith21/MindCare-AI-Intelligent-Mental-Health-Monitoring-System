import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { SessionWatcher } from "@/components/session-watcher";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/patient/dashboard", label: "Dashboard" },
  { href: "/patient/chat", label: "Chat" },
  { href: "/patient/checkin", label: "Check-in" },
  { href: "/patient/care-team", label: "Care team" },
  { href: "/patient/settings", label: "Settings" },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SessionWatcher />
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Link href="/patient/dashboard" className="text-sm font-semibold tracking-tight">
              MindCare AI
            </Link>
            <Badge variant="secondary">Patient</Badge>
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
