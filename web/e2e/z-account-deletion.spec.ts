import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, expectPatientDashboard } from "./helpers";

/**
 * Runs after the other specs (alphabetical filename) because it deletes its
 * own throwaway account and must not disturb seeded demo identities.
 */
test("a patient can delete a throwaway account with explicit confirmation", async ({
  page,
}) => {
  const email = `e2e-delete-${Date.now()}@demo.test`;

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("E2E Delete");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expectPatientDashboard(page);

  await page.goto("/patient/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  const deleteButton = page.getByRole("button", { name: "Delete my account" });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(deleteButton).toBeEnabled();

  page.once("dialog", (dialog) => void dialog.accept());
  await deleteButton.click();

  await expect(page).toHaveURL(/\/goodbye/);
  await expect(page.getByRole("heading", { name: "Goodbye" })).toBeVisible();
  await expect(page.getByLabel("Crisis support resources")).toBeVisible();
});
