import { describe, expect, it } from "vitest";
import { getAppRole, guardPath } from "./guards";

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
});
