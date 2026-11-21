/**
 * Next.js 16 request proxy (formerly middleware.ts — renamed in Next 16).
 *
 * Runs before pages render. Phase 1 scope:
 * - no session on /patient/* or /psychologist/*  -> /login
 * - session with an app_metadata.role that mismatches the area
 *   -> that role's own dashboard
 * - session without a role yet -> allowed (real enforcement in Phases 2–3)
 *
 * Sessions are read with @supabase/ssr's createServerClient + getUser().
 * The role comes only from app_metadata (see lib/guards.ts) and is forwarded
 * to pages via the x-user-role request header for display purposes only —
 * authorization is enforced by RLS + the API.
 *
 * TODO(Phase 2): once .env.local always carries NEXT_PUBLIC_SUPABASE_*,
 * remove the cookie-presence fallback below.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAppRole, guardPath } from "@/lib/guards";

const SUPABASE_ENV_SET = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Phase 1 fallback: is any Supabase auth cookie present at all? */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
}

function redirectWithCookies(to: string, request: NextRequest, source: NextResponse) {
  const response = NextResponse.redirect(new URL(to, request.url));
  // Carry any refreshed session cookies (e.g. token refresh) onto the redirect.
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Fallback when Supabase env isn't configured yet: only check that an auth
  // cookie exists, so local dev works before .env.local is created.
  if (!SUPABASE_ENV_SET) {
    const decision = guardPath(pathname, null, hasAuthCookie(request));
    if (decision.type === "redirect") {
      return NextResponse.redirect(new URL(decision.to, request.url));
    }
    return NextResponse.next();
  }

  // Cookie adapter: read from the request, write onto the response so
  // refreshed sessions persist (including on redirects).
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = getAppRole(user);
  const decision = guardPath(pathname, role, user !== null);

  if (decision.type === "redirect") {
    return redirectWithCookies(decision.to, request, supabaseResponse);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-role", role ?? "");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = {
  // Run on every route except API routes, static assets, and metadata files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
