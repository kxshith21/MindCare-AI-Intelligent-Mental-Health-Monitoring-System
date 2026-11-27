/**
 * Next.js 16 request proxy (formerly middleware.ts — renamed in Next 16).
 *
 * Runs before pages render:
 * - no session on /patient/* or /psychologist/*        -> /login
 * - mismatched app_metadata.role for the area         -> that role's dashboard
 * - unverified psychologist outside the awaiting page -> /psychologist/awaiting-verification
 *
 * Sessions are read from @supabase/ssr cookies and refreshed onto the
 * response. The role comes only from `app_metadata` (see lib/guards.ts);
 * verification comes from `psychologist_profiles`. Authorization itself is
 * enforced again by RLS and by the FastAPI endpoints.
 *
 * If Supabase env vars are missing, protected routes fail closed to /login.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAppRole, guardPath } from "@/lib/guards";
import {
  AWAITING_VERIFICATION_PATH,
  isVerifiedPsychologist,
  updateSession,
} from "@/lib/supabase/middleware";

const SUPABASE_ENV_SET = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

function redirectWithCookies(to: string, request: NextRequest, source: NextResponse) {
  const response = NextResponse.redirect(new URL(to, request.url));
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!SUPABASE_ENV_SET) {
    const decision = guardPath(pathname, null, false);
    if (decision.type === "redirect") {
      return NextResponse.redirect(new URL(decision.to, request.url));
    }
    return NextResponse.next();
  }

  const { response: source, user } = await updateSession(request);
  const role = getAppRole(user);
  const verified =
    role === "psychologist" && user
      ? await isVerifiedPsychologist(request, user.id)
      : undefined;

  const decision = guardPath(pathname, role, user !== null, verified);
  if (decision.type === "redirect") {
    return redirectWithCookies(decision.to, request, source);
  }

  source.headers.set("x-user-role", role ?? "");
  source.headers.set("x-user-verified", String(verified ?? false));
  if (pathname === AWAITING_VERIFICATION_PATH) {
    source.headers.delete("x-user-role");
  }
  return source;
}

export const config = {
  // Run on every route except API routes, static assets, and metadata files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
