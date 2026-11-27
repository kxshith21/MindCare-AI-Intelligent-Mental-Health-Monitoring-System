import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("links to the legal and safety pages from every layout", () => {
    render(<SiteFooter />);
    expect(screen.getByLabelText("Site footer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Safety" })).toHaveAttribute(
      "href",
      "/safety",
    );
  });

  it("keeps the crisis notice visible", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/Not a crisis service/i)).toBeVisible();
  });
});
