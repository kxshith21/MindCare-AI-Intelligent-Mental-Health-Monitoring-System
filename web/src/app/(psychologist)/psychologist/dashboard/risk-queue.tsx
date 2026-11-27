"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Disclaimer } from "@/components/disclaimer";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskEvent } from "@/lib/types";

const LEVEL_VARIANT = {
  low: "secondary",
  elevated: "outline",
  high: "destructive",
} as const;

/** Human review queue — triage labels only, never a clinical conclusion. */
export function RiskQueue() {
  const [events, setEvents] = useState<RiskEvent[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Defer the first state update so the effect body stays side-effect free.
    await Promise.resolve();
    setError(null);
    setEvents(null);
    try {
      const result = await api.listRiskEvents();
      setEvents(result.events);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not load the review queue."),
      );
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function review(event: RiskEvent, status: "acknowledged" | "resolved") {
    setBusyId(event.id);
    setError(null);
    try {
      const updated = await api.reviewRiskEvent(event.id, { status });
      setEvents((current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)) ?? null,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN_ERROR", "Could not update this item."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review queue</CardTitle>
        <CardDescription>
          Triage labels for human review. Message text appears only for patients
          who granted full access.
        </CardDescription>
        <Disclaimer variant="scores" />
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorState error={error} retry={() => void load()} showCrisisResources={false} />
        ) : events === null ? (
          <LoadingState label="Loading the review queue…" />
        ) : events.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            description="There are no items waiting for review."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={LEVEL_VARIANT[event.level]}>{event.level}</Badge>
                  <Badge variant="secondary">{event.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {event.reason.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                {event.content ? (
                  <p className="rounded-md bg-muted p-2 text-sm">{event.content}</p>
                ) : null}
                <div className="flex gap-2">
                  {event.status !== "acknowledged" && event.status !== "resolved" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === event.id}
                      onClick={() => void review(event, "acknowledged")}
                    >
                      Acknowledge
                    </Button>
                  ) : null}
                  {event.status !== "resolved" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busyId === event.id}
                      onClick={() => void review(event, "resolved")}
                    >
                      Resolve
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
