import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrisisResources } from "./crisis-resources";

describe("CrisisResources", () => {
  it("always renders the static fallback list with no props", () => {
    render(<CrisisResources />);
    expect(screen.getByLabelText("Crisis support resources")).toBeInTheDocument();
    expect(screen.getByText("findahelpline.com")).toBeVisible();
    expect(screen.getByText("your local emergency number")).toBeVisible();
  });

  it("renders API-provided resources without a collapse toggle", () => {
    render(
      <CrisisResources
        resources={[
          {
            name: "Test helpline",
            contact: "12345",
            detail: "Always available.",
            last_verified: "2026-11-27",
          },
        ]}
      />,
    );
    expect(screen.getByText("Test helpline")).toBeVisible();
    expect(screen.getByText("12345")).toBeVisible();
    expect(screen.queryByRole("button", { name: /show/i })).toBeNull();
  });
});
