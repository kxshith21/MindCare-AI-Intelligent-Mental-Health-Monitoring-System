import { expect, test } from "@playwright/test";
import {
  PATIENT_ONE_ID,
  PSYCHOLOGIST_UNVERIFIED,
  PSYCHOLOGIST_VERIFIED,
  expectPsychologistDashboard,
  login,
} from "./helpers";

test("verified psychologist sees pending invitations, active patients and review queue", async ({
  page,
}) => {
  await login(page, PSYCHOLOGIST_VERIFIED);
  await expectPsychologistDashboard(page);

  await expect(page.getByText("Pending invitations")).toBeVisible();
  await expect(page.getByText("Patient invitation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
  await expect(page.getByText("Active patients")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Demo Patient One" }),
  ).toBeVisible();

  await expect(page.getByText("Review queue", { exact: true })).toBeVisible();
  await expect(page.getByText("Triage labels for human review.")).toBeVisible();
  await expect(
    page.getByText(
      "Screening scores can change from week to week and are not a diagnosis.",
    ),
  ).toBeVisible();
});

test("patient detail respects scope and keeps clinician notes private", async ({ page }) => {
  await login(page, PSYCHOLOGIST_VERIFIED);
  await page.goto(`/psychologist/patients/${PATIENT_ONE_ID}`);

  await expect(
    page.getByRole("heading", { name: "Demo Patient One" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Screening scores can change from week to week and are not a diagnosis.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Check-in notes")).toBeVisible();
  await expect(page.getByText("Private clinician notes")).toBeVisible();
  await expect(page.getByText(/These notes are visible only to you/)).toBeVisible();
});

test("unverified psychologist never reaches patient data", async ({ page }) => {
  await login(page, PSYCHOLOGIST_UNVERIFIED);

  await expect(page).toHaveURL(/\/psychologist\/awaiting-verification/);
  await expect(page.getByText("Account awaiting verification")).toBeVisible();
  await expect(page.getByText("Your patients")).toHaveCount(0);
  await expect(page.getByText("Pending invitations")).toHaveCount(0);
});
