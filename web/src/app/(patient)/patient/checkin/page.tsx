"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, api, type CheckinCreateRequest } from "@/lib/api";
import { CrisisResources } from "@/components/crisis-resources";
import { Disclaimer } from "@/components/disclaimer";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ANSWER_OPTIONS,
  GAD7_ITEMS,
  PHQ9_ITEMS,
} from "@/lib/questionnaires";
import type { Checkin } from "@/lib/types";

const MOOD_OPTIONS = [
  { value: 1, label: "Very low" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Very good" },
] as const;

function emptyAnswers(length: number): Array<number | null> {
  return Array.from({ length }, () => null);
}

function allAnswered(answers: Array<number | null>): answers is number[] {
  return answers.every((answer): answer is number => answer !== null);
}

interface QuestionListProps {
  title: string;
  items: readonly string[];
  answers: Array<number | null>;
  onChange: (index: number, value: number) => void;
}

function QuestionList({ title, items, answers, onChange }: QuestionListProps) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-medium">{title}</legend>
      {items.map((item, index) => (
        <div key={item} className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="mr-1 text-muted-foreground">{index + 1}.</span>
            {item}
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={item}>
            {ANSWER_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs",
                  answers[index] === option.value && "border-primary bg-primary/10",
                )}
              >
                <input
                  type="radio"
                  name={`${title}-${index}`}
                  value={option.value}
                  checked={answers[index] === option.value}
                  onChange={() => onChange(index, option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export default function PatientCheckinPage() {
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [includePhq9, setIncludePhq9] = useState(false);
  const [includeGad7, setIncludeGad7] = useState(false);
  const [phq9, setPhq9] = useState<Array<number | null>>(() => emptyAnswers(9));
  const [gad7, setGad7] = useState<Array<number | null>>(() => emptyAnswers(7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [result, setResult] = useState<Checkin | null>(null);

  function reset() {
    setMood(null);
    setNote("");
    setIncludePhq9(false);
    setIncludeGad7(false);
    setPhq9(emptyAnswers(9));
    setGad7(emptyAnswers(7));
    setError(null);
    setValidation(null);
    setResult(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setValidation(null);

    if (mood === null) {
      setValidation("Choose a mood before saving.");
      return;
    }
    if (includePhq9 && !allAnswered(phq9)) {
      setValidation("Answer every PHQ-9 question, or skip that section.");
      return;
    }
    if (includeGad7 && !allAnswered(gad7)) {
      setValidation("Answer every GAD-7 question, or skip that section.");
      return;
    }

    const payload: CheckinCreateRequest = {
      mood,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(includePhq9 && allAnswered(phq9) ? { phq9_answers: phq9 } : {}),
      ...(includeGad7 && allAnswered(gad7) ? { gad7_answers: gad7 } : {}),
    };

    setBusy(true);
    try {
      const saved = await api.createCheckin(payload);
      setResult(saved);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not save your check-in."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1
            className="text-xl font-semibold tracking-tight"
            aria-live="polite"
          >
            Check-in saved
          </h1>
          <p className="text-sm text-muted-foreground">
            Thank you for taking a moment to reflect.
          </p>
        </div>
        <Disclaimer variant="scores" />

        {result.show_crisis_resources ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Thank you for telling us. Support is available right now — you do
              not have to face this alone.
            </p>
            <CrisisResources resources={result.crisis_resources ?? []} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/patient/dashboard">Back to dashboard</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            Add another check-in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Check-in</h1>
        <p className="text-sm text-muted-foreground">
          Record how today feels. The screening questions are optional.
        </p>
      </div>
      <Disclaimer variant="questions" />

      {error ? <ErrorState error={error} retry={reset} /> : null}

      <form onSubmit={submit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">How is your mood today?</legend>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "cursor-pointer rounded-lg border border-border px-3 py-2 text-sm",
                  mood === option.value && "border-primary bg-primary/10",
                )}
              >
                <input
                  type="radio"
                  name="mood"
                  value={option.value}
                  checked={mood === option.value}
                  onChange={() => setMood(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm">
          Note <span className="text-muted-foreground">(optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Anything you want to remember about today"
            className="resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>

        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePhq9}
              onChange={(event) => setIncludePhq9(event.target.checked)}
            />
            Include PHQ-9 screening questions (9 items)
          </label>
          {includePhq9 ? (
            <QuestionList
              title="PHQ-9 screening questions"
              items={PHQ9_ITEMS}
              answers={phq9}
              onChange={(index, value) =>
                setPhq9((current) =>
                  current.map((answer, i) => (i === index ? value : answer)),
                )
              }
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeGad7}
              onChange={(event) => setIncludeGad7(event.target.checked)}
            />
            Include GAD-7 screening questions (7 items)
          </label>
          {includeGad7 ? (
            <QuestionList
              title="GAD-7 screening questions"
              items={GAD7_ITEMS}
              answers={gad7}
              onChange={(index, value) =>
                setGad7((current) =>
                  current.map((answer, i) => (i === index ? value : answer)),
                )
              }
            />
          ) : null}
        </div>

        {validation ? (
          <p className="text-sm text-destructive" role="alert">
            {validation}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save check-in"}
          </Button>
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/patient/dashboard">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
