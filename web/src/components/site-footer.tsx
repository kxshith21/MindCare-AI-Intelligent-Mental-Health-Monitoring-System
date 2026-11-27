import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/safety", label: "Safety" },
] as const;

/** Shared footer in the root layout — visible on public and signed-in pages. */
export function SiteFooter() {
  return (
    <footer className="border-t bg-background" aria-label="Site footer">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Not a crisis service. MindCare AI is not a therapist.</p>
        <nav aria-label="Legal and safety information" className="flex flex-wrap gap-4">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="underline hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
