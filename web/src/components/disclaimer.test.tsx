import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclaimer } from "./disclaimer";

describe("Disclaimer", () => {
  it("uses the exact required screening-question wording", () => {
    render(<Disclaimer variant="questions" />);
    expect(
      screen.getByText(
        "These are screening questions used by clinicians. They are not a diagnosis.",
      ),
    ).toBeVisible();
  });

  it("uses the exact required screening-score wording", () => {
    render(<Disclaimer variant="scores" />);
    expect(
      screen.getByText(
        "Screening scores can change from week to week and are not a diagnosis.",
      ),
    ).toBeVisible();
  });
});
