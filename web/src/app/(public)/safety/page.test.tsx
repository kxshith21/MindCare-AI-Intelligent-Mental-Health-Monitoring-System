import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafetyPage from "./page";

describe("SafetyPage", () => {
  it("reuses the always-visible crisis resources panel", () => {
    render(<SafetyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Safety" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Crisis support resources")).toBeVisible();
    expect(screen.getByText("findahelpline.com")).toBeVisible();
  });

  it("states the non-crisis limits and does not carry a draft banner", () => {
    render(<SafetyPage />);
    expect(screen.getByText(/therapist or a crisis service/i)).toBeVisible();
    expect(screen.getByText(/imperfect and can be missed/i)).toBeVisible();
    expect(screen.getByText(/third-party LLM provider/i)).toBeVisible();
    expect(
      screen.queryByText("DRAFT - requires legal review before launch"),
    ).toBeNull();
    expect(document.body).not.toHaveTextContent(/HIPAA|GDPR|DPDP/);
  });
});
