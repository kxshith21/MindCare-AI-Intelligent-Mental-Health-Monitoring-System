/**
 * Pure route-guard logic used by src/proxy.ts (Next.js 16 request proxy).
 *
 * Kept dependency-free so it can be unit-tested with vitest.
 *
 * Role source: **`app_metadata.role` ONLY** — never `user_metadata`.
 * `user_metadata` is client-writable, so a user could edit their own metadata
 * to claim the psychologist role. `app_metadata` is written server-side only.
 *
 * TODO(Phase 2): signup must not let clients self-assign the psychologist
 * role. The role must be set into `app_metadata` server-side (Supabase admin
 * API / auth hook) at account creation; client-supplied `user_metadata.role`
 * must never grant access.
 *
 * Phase 1 scope: the proxy only checks that a *session exists*. Real role
 * enforcement lives in RLS (Phase 2) and the API (Phase 3).
 */

export type Role = "patient" | "psychologist";

const APP_ROLES: readonly string[] = ["patient", "psychologist"];

/** Routes that never require a session. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/", "/login", "/signup"]);

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
 * - public paths always pass
 * - paths outside `/patient/*` and `/psychologist/*` are not ours to guard
 * - no session on a protected path → /login   (Phase 1 requirement)
 * - session with a mismatched `app_metadata.role` → that role's own dashboard
 * - session without a known role → allowed through for now; real role
 *   enforcement arrives with RLS (Phase 2) and the API (Phase 3)
 */
export function guardPath(
  pathname: string,
  role: Role | null,
  hasSession: boolean,
): GuardDecision {
  if (PUBLIC_PATHS.has(pathname)) return { type: "allow" };

  const isPatientArea = pathname === "/patient" || pathname.startsWith("/patient/");
  const isPsychologistArea =
    pathname === "/psychologist" || pathname.startsWith("/psychologist/");

  if (!isPatientArea && !isPsychologistArea) return { type: "allow" };

  if (!hasSession) return { type: "redirect", to: "/login" };

  // Session exists but role not yet assigned — allow; Phase 2/3 enforce.
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
