import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "demo-password-123";
export const PATIENT_ONE = "patient.one@demo.test";
export const PATIENT_ONE_ID = "11111111-1111-1111-1111-111111111111";
export const PSYCHOLOGIST_VERIFIED = "dr.verified@demo.test";
export const PSYCHOLOGIST_UNVERIFIED = "dr.unverified@demo.test";

/** Logs in with a seeded local Supabase identity. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Wait for the cookie-backed redirect before a test navigates elsewhere;
  // otherwise page.goto() can race the in-flight sign-in handler.
  await expect(page).toHaveURL(/\/(patient|psychologist)\//, { timeout: 15_000 });
}

export async function expectPatientDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await expect(page.getByRole("heading", { name: "Your dashboard" })).toBeVisible();
}

export async function expectPsychologistDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/psychologist\/dashboard/);
  await expect(page.getByRole("heading", { name: "Your patients" })).toBeVisible();
}

/** Every PHQ-9 answer in the open questionnaire, by option label. */
export async function answerPhq9(
  page: Page,
  labels: readonly string[],
): Promise<void> {
  const groups = page
    .locator("fieldset")
    .filter({ hasText: "PHQ-9 screening questions" })
    .locator('[role="radiogroup"]');
  await expect(groups).toHaveCount(9);
  for (let index = 0; index < 9; index += 1) {
    // The radio inputs are visually hidden; click the visible label instead.
    await groups
      .nth(index)
      .getByText(labels[index] ?? "Not at all", { exact: true })
      .click();
  }
}
