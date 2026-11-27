import { expect, test } from "@playwright/test";

test("landing page renders support resources without a session", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /check in with yourself/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Crisis support resources")).toBeVisible();
  await expect(page.getByText("findahelpline.com")).toBeVisible();
});

test("auth and screening wording stays safe", async ({ page }) => {
  await page.goto("/signup/psychologist");
  await expect(page.getByRole("heading", { name: "Psychologist account" })).toBeVisible();
  await page.goto("/login");
  await expect(
    page.getByText(/Not a crisis service/i),
  ).toBeVisible();
});
