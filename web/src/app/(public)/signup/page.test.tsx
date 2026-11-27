import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupPage from "./page";

const { signUp, push } = vi.hoisted(() => ({
  signUp: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp } }),
}));

describe("patient signup acknowledgments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it("requires both acknowledgments and links to the legal pages", () => {
    render(<SignupPage />);
    const legal = screen.getByRole("checkbox", {
      name: /I accept the Terms and Privacy notice/i,
    });
    const age = screen.getByRole("checkbox", {
      name: /I confirm that I am 18 or older/i,
    });

    expect(legal).toBeRequired();
    expect(age).toBeRequired();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Safety" })).toHaveAttribute(
      "href",
      "/safety",
    );
  });

  it("does not sign up when the acknowledgments are missing", () => {
    render(<SignupPage />);
    const form = screen.getByRole("button", { name: "Sign up" }).closest("form");
    expect(form).not.toBeNull();

    // Submit directly: jsdom blocks clicks on forms with required empty fields.
    fireEvent.submit(form!);

    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/accept the terms/i);
  });

  it("records every consent flag in signup metadata once both boxes are checked", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);

    await user.type(screen.getByLabelText("Display name"), "Test Patient");
    await user.type(screen.getByLabelText("Email"), "patient@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(
      screen.getByRole("checkbox", {
        name: /I accept the Terms and Privacy notice/i,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I confirm that I am 18 or older/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(signUp).toHaveBeenCalledWith({
      email: "patient@example.test",
      password: "password123",
      options: {
        data: {
          display_name: "Test Patient",
          terms_accepted: true,
          privacy_accepted: true,
          crisis_notice_acknowledged: true,
          age_18_plus: true,
          consent_document_version: "draft-2026-11-27",
        },
      },
    });
    expect(push).toHaveBeenCalledWith("/patient/dashboard");
  });
});
