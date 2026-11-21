import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            MindCare AI
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="text-muted-foreground hover:text-foreground">
              Sign up
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
