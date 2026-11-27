"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Disclaimer } from "@/components/disclaimer";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/ui/button";
import type { Checkin } from "@/lib/types";

const RANGE_DAYS = 90;

export default function PatientDashboardPage() {
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    // Defer the first state update so the effect body stays side-effect free.
    await Promise.resolve();
    setError(null);
    setCheckins(null);
    try {
      const from = new Date(Date.now() - RANGE_DAYS * 86_400_000).toISOString();
      const to = new Date().toISOString();
      const result = await api.listCheckins({ from, to });
      setCheckins(result.checkins);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not load your check-ins."),
      );
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Your dashboard</h1>
          <p className="text-sm text-muted-foreground">
            A reflection of your recent check-ins. Nothing here is shared with
            anyone unless you grant a care-team link.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/patient/chat">Reflect in chat</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/patient/checkin">Add a check-in</Link>
          </Button>
        </div>
      </div>

      <Disclaimer />

      {error ? (
        <ErrorState error={error} retry={() => void load()} />
      ) : checkins === null ? (
        <LoadingState label="Loading your check-ins…" />
      ) : (
        <>
          <TrendChart points={checkins} title="Your check-in trends" />
          {checkins.length === 0 ? (
            <EmptyState
              title="No check-ins in this period"
              description="Add a check-in to start seeing your own mood and screening scores over time."
              action={
                <Button asChild size="sm" className="mt-2">
                  <Link href="/patient/checkin">Add a check-in</Link>
                </Button>
              }
            />
          ) : (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">Recent check-ins</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {checkins
                  .slice(-6)
                  .reverse()
                  .map((checkin) => (
                    <li
                      key={checkin.id}
                      className="rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <p className="text-muted-foreground">
                        {new Date(checkin.created_at).toLocaleDateString()}
                      </p>
                      <p className="mt-1">Mood: {checkin.mood} / 5</p>
                      {checkin.note ? (
                        <p className="mt-1 text-muted-foreground">{checkin.note}</p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
