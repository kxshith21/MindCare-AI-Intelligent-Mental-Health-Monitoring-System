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
    page.locator("main").getByText(/Not a crisis service/i),
  ).toBeVisible();
});

test("legal pages show draft banners and shared footer links", async ({ page }) => {
  const footer = page.getByRole("contentinfo");
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(
      page.getByText("DRAFT - requires legal review before launch"),
    ).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Safety" })).toBeVisible();
  }

  await page.goto("/safety");
  await expect(page.getByLabel("Crisis support resources")).toBeVisible();
  await expect(page.getByText("findahelpline.com")).toBeVisible();
});

test("patient signup shows required legal acknowledgments", async ({ page }) => {
  await page.goto("/signup");
  const legal = page.getByRole("checkbox", {
    name: /I accept the Terms and Privacy notice/i,
  });
  const age = page.getByRole("checkbox", {
    name: /I confirm that I am 18 or older/i,
  });

  await expect(legal).toHaveAttribute("required");
  await expect(age).toHaveAttribute("required");
  const formLinks = page.locator("main");
  await expect(formLinks.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(
    formLinks.getByRole("link", { name: "Privacy notice" }),
  ).toBeVisible();
  await expect(formLinks.getByRole("link", { name: "Safety" })).toBeVisible();

  await page.getByLabel("Display name").fill("E2E Signup");
  await page.getByLabel("Email").fill(`e2e-signup-${Date.now()}@demo.test`);
  await page.getByLabel("Password").fill("demo-password-123");
  await page.getByRole("button", { name: "Sign up" }).click();
  // Native required-field validation keeps the unchecked form on /signup.
  await expect(page).toHaveURL(/\/signup$/);
});
