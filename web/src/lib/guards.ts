/**
 * Pure route-guard logic used by src/proxy.ts (Next.js 16 request proxy).
 *
 * Kept dependency-free so it can be unit-tested with vitest.
 *
 * Role source: **`app_metadata.role` ONLY** — never `user_metadata`.
 * `user_metadata` is client-writable, so a user could edit their own metadata
 * to claim the psychologist role. `app_metadata` is written server-side only.
 *
 * The psychologist role is assigned only by the server-side signup endpoint
 * (`POST /auth/psychologist-signup`); client-supplied `user_metadata.role`
 * is ignored by both Supabase Auth and the DB signup trigger.
 *
 * Role enforcement lives here for routing, in RLS for data, and in the API
 * for endpoints that use the service role.
 */

export type Role = "patient" | "psychologist";

const APP_ROLES: readonly string[] = ["patient", "psychologist"];

/** Routes that never require a session (auth pages + landing). */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/signup",
  "/signup/psychologist",
]);

const DASHBOARD: Record<Role, string> = {
  patient: "/patient/dashboard",
  psychologist: "/psychologist/dashboard",
};

export type GuardDecision = { type: "allow" } | { type: "redirect"; to: string };

function normalizeRole(value: unknown): Role | null {
  return typeof value === "string" && APP_ROLES.includes(value) ? (value as Role) : null;
}

/**
 * Extract the app role from a Supabase user object.
 *
 * Reads `app_metadata.role` only. Returns null when the user is missing or
 * has no recognized role yet (role assignment lands in Phase 2).
 */
export function getAppRole(user: unknown): Role | null {
  if (!user || typeof user !== "object") return null;
  const appMetadata = (user as Record<string, unknown>).app_metadata;
  if (!appMetadata || typeof appMetadata !== "object") return null;
  return normalizeRole((appMetadata as Record<string, unknown>).role);
}

/**
 * Decide whether a pathname may be rendered.
 * - public paths pass, but a signed-in user with a known role is sent to
 *   their own dashboard (they have no business on /login, /signup, /)
 * - paths outside `/patient/*` and `/psychologist/*` are not ours to guard
 * - no session on a protected path → /login
 * - session with a mismatched `app_metadata.role` → that role's own dashboard
 * - session without a known role → allowed; the role area layouts/pages
 *   enforce verification and RLS enforces data access
 */
export function guardPath(
  pathname: string,
  role: Role | null,
  hasSession: boolean,
): GuardDecision {
  if (PUBLIC_PATHS.has(pathname)) {
    if (hasSession && role !== null) {
      return { type: "redirect", to: DASHBOARD[role] };
    }
    return { type: "allow" };
  }

  const isPatientArea = pathname === "/patient" || pathname.startsWith("/patient/");
  const isPsychologistArea =
    pathname === "/psychologist" || pathname.startsWith("/psychologist/");

  if (!isPatientArea && !isPsychologistArea) return { type: "allow" };

  if (!hasSession) return { type: "redirect", to: "/login" };

  // Session exists but role not yet assigned — allow; enforcement is RLS.
  if (role === null) return { type: "allow" };

  if (isPatientArea) {
    return role === "patient"
      ? { type: "allow" }
      : { type: "redirect", to: "/psychologist/dashboard" };
  }

  return role === "psychologist"
    ? { type: "allow" }
    : { type: "redirect", to: "/patient/dashboard" };
}
