"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Disclaimer } from "@/components/disclaimer";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClinicianNote, TrendPoint } from "@/lib/types";

interface PatientDetailProps {
  patientId: string;
  displayName: string;
}

export function PatientDetail({ patientId, displayName }: PatientDetailProps) {
  const [trends, setTrends] = useState<{
    share_scope: "summary_only" | "full";
    checkins: TrendPoint[];
  } | null>(null);
  const [notes, setNotes] = useState<ClinicianNote[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    // Defer the first state update so the effect body stays side-effect free.
    await Promise.resolve();
    setError(null);
    setTrends(null);
    setNotes(null);
    try {
      const [trendResult, noteResult] = await Promise.all([
        api.getTrends(patientId),
        api.listClinicianNotes(patientId),
      ]);
      setTrends({
        share_scope: trendResult.share_scope,
        checkins: trendResult.checkins,
      });
      setNotes(noteResult.notes);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not load this patient."),
      );
    }
  }, [patientId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = noteDraft.trim();
    if (!note) return;
    setSaving(true);
    setError(null);
    try {
      await api.addClinicianNote(patientId, { note });
      setNoteDraft("");
      const result = await api.listClinicianNotes(patientId);
      setNotes(result.notes);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not save the note."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
        <p className="text-sm text-muted-foreground">
          {trends
            ? trends.share_scope === "full"
              ? "Full access: check-ins, notes, messages and questionnaire answers."
              : "Summary only: check-in mood and screening scores."
            : "Loading shared scope…"}
        </p>
      </div>
      <Disclaimer variant="scores" />

      {error ? (
        <ErrorState error={error} retry={() => void load()} showCrisisResources={false} />
      ) : trends === null || notes === null ? (
        <LoadingState label="Loading shared information…" />
      ) : (
        <>
          <TrendChart points={trends.checkins} title="Shared check-in trends" />

          <Card>
            <CardHeader>
              <CardTitle>Check-in notes</CardTitle>
              <CardDescription>
                Notes are visible to you only when the patient granted full
                access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trends.checkins.length === 0 ? (
                <EmptyState title="No shared check-ins" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {trends.checkins
                    .slice()
                    .reverse()
                    .filter((point) => point.note)
                    .map((point, index) => (
                      <li key={`${point.created_at}-${index}`} className="rounded-md bg-muted p-2 text-sm">
                        <span className="text-xs text-muted-foreground">
                          {new Date(point.created_at).toLocaleDateString()}
                        </span>
                        <p className="mt-1">{point.note}</p>
                      </li>
                    ))}
                  {trends.checkins.every((point) => !point.note) ? (
                    <li className="text-sm text-muted-foreground">
                      No notes were shared.
                    </li>
                  ) : null}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Private clinician notes</CardTitle>
              <CardDescription>
                These notes are visible only to you, never to the patient.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {notes.length === 0 ? (
                <EmptyState title="No notes yet" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-md border border-border p-3 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {new Date(note.created_at).toLocaleString()}
                      </span>
                      <p className="mt-1">{note.note}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addNote} className="flex flex-col gap-2">
                <label htmlFor="clinician-note" className="text-sm font-medium">
                  Add a note
                </label>
                <textarea
                  id="clinician-note"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  maxLength={8000}
                  rows={3}
                  className="resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <Button type="submit" size="sm" disabled={saving || !noteDraft.trim()} className="self-start">
                  {saving ? "Saving…" : "Save note"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
