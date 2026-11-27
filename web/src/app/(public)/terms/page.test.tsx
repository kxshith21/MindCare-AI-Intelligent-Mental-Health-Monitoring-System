import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "./page";

describe("TermsPage", () => {
  it("shows the draft banner and the current ground rules", () => {
    render(<TermsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of use" }),
    ).toBeVisible();
    expect(
      screen.getByText("DRAFT - requires legal review before launch"),
    ).toBeVisible();

    expect(screen.getByText(/18 or older/i)).toBeVisible();
    expect(screen.getByText(/third-party LLM provider/i)).toBeVisible();
    expect(screen.getByText("share_scope")).toBeVisible();
    expect(screen.getByText(/access is logged/i)).toBeVisible();
    expect(screen.getByText(/not a therapist or a crisis service/i)).toBeVisible();
    expect(screen.getByText(/imperfect and can be missed/i)).toBeVisible();
    expect(screen.getByText(/Delete my account/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Safety" })).toHaveAttribute(
      "href",
      "/safety",
    );
    expect(screen.getByRole("link", { name: "Privacy notice" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("makes no regulatory compliance claims", () => {
    render(<TermsPage />);
    expect(document.body).not.toHaveTextContent(/HIPAA|GDPR|DPDP/);
  });
});
