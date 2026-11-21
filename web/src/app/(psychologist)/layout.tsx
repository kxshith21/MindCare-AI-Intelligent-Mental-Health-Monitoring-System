import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const NAV = [{ href: "/psychologist/dashboard", label: "Dashboard" }];

export default function PsychologistLayout({ children }: { children: React.ReactNode }) {
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
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
