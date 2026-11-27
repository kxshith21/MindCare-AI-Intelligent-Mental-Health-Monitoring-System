/**
 * Pure route-guard logic used by src/proxy.ts (Next.js 16 request proxy).
 *
 * Role source: **`app_metadata.role` ONLY** — never `user_metadata`.
 * Verification is a separate claim read from `psychologist_profiles`.
 */
export type Role = "patient" | "psychologist";

const APP_ROLES: readonly string[] = ["patient", "psychologist"];

export const AWAITING_VERIFICATION_PATH = "/psychologist/awaiting-verification";

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

/** Read the role from `app_metadata` only. */
export function getAppRole(user: unknown): Role | null {
  if (!user || typeof user !== "object") return null;
  const appMetadata = (user as Record<string, unknown>).app_metadata;
  if (!appMetadata || typeof appMetadata !== "object") return null;
  return normalizeRole((appMetadata as Record<string, unknown>).role);
}

/**
 * Decide whether a pathname may be rendered.
 *
 * `verified` is optional so existing 3-argument callers keep the previous
 * behavior; when explicitly false, psychologists are held on the awaiting page.
 */
export function guardPath(
  pathname: string,
  role: Role | null,
  hasSession: boolean,
  verified?: boolean | null,
): GuardDecision {
  if (pathname === AWAITING_VERIFICATION_PATH) {
    if (!hasSession) return { type: "redirect", to: "/login" };
    if (role === "patient") return { type: "redirect", to: DASHBOARD.patient };
    return { type: "allow" };
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (hasSession && role !== null) {
      if (role === "psychologist" && verified === false) {
        return { type: "redirect", to: AWAITING_VERIFICATION_PATH };
      }
      return { type: "redirect", to: DASHBOARD[role] };
    }
    return { type: "allow" };
  }

  const isPatientArea = pathname === "/patient" || pathname.startsWith("/patient/");
  const isPsychologistArea =
    pathname === "/psychologist" || pathname.startsWith("/psychologist/");

  if (!isPatientArea && !isPsychologistArea) return { type: "allow" };
  if (!hasSession) return { type: "redirect", to: "/login" };
  if (role === null) return { type: "allow" };

  if (isPatientArea) {
    return role === "patient"
      ? { type: "allow" }
      : { type: "redirect", to: DASHBOARD.psychologist };
  }

  if (role !== "psychologist") return { type: "redirect", to: DASHBOARD.patient };
  if (verified === false) return { type: "redirect", to: AWAITING_VERIFICATION_PATH };
  return { type: "allow" };
}
