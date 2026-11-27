import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("shows the draft banner and explains data handling in plain language", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy notice" }),
    ).toBeVisible();
    expect(
      screen.getByText("DRAFT - requires legal review before launch"),
    ).toBeVisible();

    expect(screen.getByText(/third-party LLM provider/i)).toBeVisible();
    expect(screen.getByText("share_scope")).toBeVisible();
    expect(screen.getByText(/access-log entry/i)).toBeVisible();
    expect(screen.getByText(/not a therapist or a crisis service/i)).toBeVisible();
    expect(screen.getByText(/imperfect and can be missed/i)).toBeVisible();
    expect(screen.getByText(/Delete my account/i)).toBeVisible();
  });

  it("makes no regulatory compliance claims", () => {
    render(<PrivacyPage />);
    expect(document.body).not.toHaveTextContent(/HIPAA|GDPR|DPDP/);
  });
});
