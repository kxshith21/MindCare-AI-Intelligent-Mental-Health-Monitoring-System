import { describe, expect, it } from "vitest";
import { AWAITING_VERIFICATION_PATH, getAppRole, guardPath } from "./guards";

describe("getAppRole", () => {
  it("returns null when the user is missing", () => {
    expect(getAppRole(null)).toBeNull();
    expect(getAppRole(undefined)).toBeNull();
  });

  it("reads the role from app_metadata", () => {
    expect(getAppRole({ app_metadata: { role: "patient" } })).toBe("patient");
    expect(getAppRole({ app_metadata: { role: "psychologist" } })).toBe("psychologist");
  });

  it("ignores user_metadata (client-writable — must never grant access)", () => {
    expect(getAppRole({ user_metadata: { role: "psychologist" } })).toBeNull();
    expect(
      getAppRole({ app_metadata: {}, user_metadata: { role: "psychologist" } }),
    ).toBeNull();
  });

  it("ignores top-level and Supabase's built-in 'authenticated' role claims", () => {
    expect(getAppRole({ role: "patient" })).toBeNull();
    expect(getAppRole({ role: "authenticated", app_metadata: {} })).toBeNull();
  });

  it("returns null for unrecognized role values", () => {
    expect(getAppRole({ app_metadata: { role: "admin" } })).toBeNull();
    expect(getAppRole({ app_metadata: {} })).toBeNull();
    expect(getAppRole({ app_metadata: null })).toBeNull();
  });
});

describe("guardPath", () => {
  it("allows public paths for everyone", () => {
    expect(guardPath("/", null, false)).toEqual({ type: "allow" });
    expect(guardPath("/login", null, false)).toEqual({ type: "allow" });
    expect(guardPath("/signup", null, false)).toEqual({ type: "allow" });
    expect(guardPath("/signup/psychologist", null, false)).toEqual({ type: "allow" });
  });

  it("sends a signed-in user with a known role away from auth pages to their dashboard", () => {
    expect(guardPath("/login", "patient", true)).toEqual({
      type: "redirect",
      to: "/patient/dashboard",
    });
    expect(guardPath("/signup", "psychologist", true)).toEqual({
      type: "redirect",
      to: "/psychologist/dashboard",
    });
    expect(guardPath("/signup/psychologist", "patient", true)).toEqual({
      type: "redirect",
      to: "/patient/dashboard",
    });
    expect(guardPath("/", "psychologist", true)).toEqual({
      type: "redirect",
      to: "/psychologist/dashboard",
    });
  });

  it("keeps a signed-in session without a role on auth pages (no dashboard to pick yet)", () => {
    expect(guardPath("/login", null, true)).toEqual({ type: "allow" });
    expect(guardPath("/signup", null, true)).toEqual({ type: "allow" });
  });

  it("sends users without a session on protected routes to login", () => {
    expect(guardPath("/patient/dashboard", null, false)).toEqual({
      type: "redirect",
      to: "/login",
    });
    expect(guardPath("/patient/chat", "patient", false)).toEqual({
      type: "redirect",
      to: "/login",
    });
    expect(guardPath("/psychologist/dashboard", null, false)).toEqual({
      type: "redirect",
      to: "/login",
    });
    expect(guardPath("/psychologist/patients/1", "psychologist", false)).toEqual({
      type: "redirect",
      to: "/login",
    });
  });

  it("allows a session into its own role area", () => {
    expect(guardPath("/patient/dashboard", "patient", true)).toEqual({ type: "allow" });
    expect(guardPath("/patient", "patient", true)).toEqual({ type: "allow" });
    expect(guardPath("/patient/checkin/", "patient", true)).toEqual({ type: "allow" });
    expect(guardPath("/psychologist/dashboard", "psychologist", true)).toEqual({
      type: "allow",
    });
    expect(guardPath("/psychologist/patients/42", "psychologist", true)).toEqual({
      type: "allow",
    });
  });

  it("redirects a session on the other role's area to its own dashboard", () => {
    expect(guardPath("/patient/dashboard", "psychologist", true)).toEqual({
      type: "redirect",
      to: "/psychologist/dashboard",
    });
    expect(guardPath("/psychologist/patients/42", "patient", true)).toEqual({
      type: "redirect",
      to: "/patient/dashboard",
    });
  });

  it("allows a session without an assigned role yet (Phase 2 enforces)", () => {
    expect(guardPath("/patient/dashboard", null, true)).toEqual({ type: "allow" });
    expect(guardPath("/psychologist/dashboard", null, true)).toEqual({ type: "allow" });
  });

  it("does not guard paths outside the two role areas", () => {
    expect(guardPath("/api/anything", null, false)).toEqual({ type: "allow" });
    expect(guardPath("/patients", null, false)).toEqual({ type: "allow" });
    expect(guardPath("/somewhere-else", "patient", true)).toEqual({ type: "allow" });
  });

  it("holds unverified psychologists on the awaiting-verification page", () => {
    expect(
      guardPath("/psychologist/dashboard", "psychologist", true, false),
    ).toEqual({ type: "redirect", to: AWAITING_VERIFICATION_PATH });
    expect(
      guardPath("/psychologist/patients/42", "psychologist", true, false),
    ).toEqual({ type: "redirect", to: AWAITING_VERIFICATION_PATH });
    expect(
      guardPath("/login", "psychologist", true, false),
    ).toEqual({ type: "redirect", to: AWAITING_VERIFICATION_PATH });
  });

  it("allows verified psychologists and the awaiting page itself", () => {
    expect(
      guardPath("/psychologist/dashboard", "psychologist", true, true),
    ).toEqual({ type: "allow" });
    expect(
      guardPath(AWAITING_VERIFICATION_PATH, "psychologist", true, false),
    ).toEqual({ type: "allow" });
    expect(guardPath(AWAITING_VERIFICATION_PATH, null, false)).toEqual({
      type: "redirect",
      to: "/login",
    });
    expect(
      guardPath(AWAITING_VERIFICATION_PATH, "patient", true),
    ).toEqual({ type: "redirect", to: "/patient/dashboard" });
  });
});
