import { expect, test } from "@playwright/test";
import {
  answerPhq9,
  PATIENT_ONE,
  expectPatientDashboard,
  login,
} from "./helpers";

const ALL_NOT_AT_ALL = Array(9).fill("Not at all") as string[];

test("patient dashboard loads with safe wording", async ({ page }) => {
  await login(page, PATIENT_ONE);
  await expectPatientDashboard(page);
  await expect(
    page.getByText(
      "MindCare AI offers reflection and check-ins. It is not a crisis service or a substitute for professional care.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/wellness score/i)).toHaveCount(0);
});

test("patient chat sends one message and shows a supportive reply", async ({ page }) => {
  await login(page, PATIENT_ONE);
  await page.goto("/patient/chat");
  await expect(page.getByRole("heading", { name: "Reflect in chat" })).toBeVisible();

  const message = `E2E reflection ${Date.now()}`;
  await page.getByLabel("Your message").fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("article").filter({ hasText: message })).toBeVisible();
  await expect(page.getByText(/I'm here with you/).last()).toBeVisible();
  await expect(page.getByText(/risk level/i)).toHaveCount(0);
  await expect(page.getByLabel("Crisis support resources")).toHaveCount(0);
});

test("a check-in with no item-9 flag stores safely without resources", async ({ page }) => {
  await login(page, PATIENT_ONE);
  await page.goto("/patient/checkin");

  await expect(
    page.getByText(
      "These are screening questions used by clinicians. They are not a diagnosis.",
    ),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "How is your mood today?" })
    .getByText("Okay", { exact: true })
    .click();
  await page.getByLabel(/Include PHQ-9 screening questions/).check();
  await answerPhq9(page, ALL_NOT_AT_ALL);
  await page.getByRole("button", { name: "Save check-in" }).click();

  await expect(page.getByRole("heading", { name: "Check-in saved" })).toBeVisible();
  await expect(
    page.getByText(
      "Screening scores can change from week to week and are not a diagnosis.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Crisis support resources")).toHaveCount(0);
  await expect(page.getByText(/risk level/i)).toHaveCount(0);
});

test("a positive PHQ-9 item 9 shows crisis resources, never a risk label", async ({ page }) => {
  await login(page, PATIENT_ONE);
  await page.goto("/patient/checkin");

  await page
    .getByRole("group", { name: "How is your mood today?" })
    .getByText("Low", { exact: true })
    .click();
  await page.getByLabel(/Include PHQ-9 screening questions/).check();
  const answers = [...ALL_NOT_AT_ALL];
  answers[8] = "Nearly every day";
  await answerPhq9(page, answers);
  await page.getByRole("button", { name: "Save check-in" }).click();

  await expect(page.getByRole("heading", { name: "Check-in saved" })).toBeVisible();
  await expect(page.getByLabel("Crisis support resources")).toBeVisible();
  // Region-specific contacts vary by profile; the safety panel itself is fixed.
  await expect(page.getByRole("heading", { name: "Support right now" })).toBeVisible();
  await expect(
    page.getByText("Thank you for telling us. Support is available right now"),
  ).toBeVisible();
  await expect(page.getByText(/risk level/i)).toHaveCount(0);
  await expect(page.getByText(/\bhigh\b/i)).toHaveCount(0);
});

test("care team shows consent scope and keeps invite responses generic", async ({ page }) => {
  await login(page, PATIENT_ONE);
  await page.goto("/patient/care-team");

  await expect(page.getByRole("heading", { name: "Care team" })).toBeVisible();
  await expect(page.getByText("Dr Verified")).toBeVisible();
  await expect(page.getByText(/Active · summary only/).first()).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Dr Verified" })
      .getByLabel("Scope"),
  ).toBeVisible();

  await page
    .getByLabel("Psychologist email")
    .fill("nobody-here@demo.test");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByText(
      "If a verified psychologist matches that address, they will receive your invitation.",
    ),
  ).toBeVisible();
});
