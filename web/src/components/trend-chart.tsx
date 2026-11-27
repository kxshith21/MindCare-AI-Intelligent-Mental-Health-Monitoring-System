"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Disclaimer } from "@/components/disclaimer";
import { EmptyState } from "@/components/empty-state";

export interface ChartPoint {
  mood: number;
  phq9_score?: number | null;
  gad7_score?: number | null;
  created_at: string;
}

interface TrendChartProps {
  points: readonly ChartPoint[];
  title?: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Plots only real check-in values — no derived or synthetic scores. */
export function TrendChart({
  points,
  title = "Check-in trends",
}: TrendChartProps) {
  if (points.length === 0) {
    return (
      <EmptyState
        title="No check-ins yet"
        description="Your chart will show check-in mood and screening scores once you add a check-in."
      />
    );
  }

  const data = [...points]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((point) => ({
      date: formatDate(point.created_at),
      mood: point.mood,
      phq9: point.phq9_score ?? null,
      gad7: point.gad7_score ?? null,
    }));

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="h-72 w-full rounded-xl border border-border bg-card p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis
              yAxisId="scores"
              domain={[0, 21]}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              yAxisId="mood"
              orientation="right"
              domain={[1, 5]}
              allowDecimals={false}
              hide
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                fontSize: "0.8rem",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
            <Line
              yAxisId="mood"
              type="monotone"
              dataKey="mood"
              name="Mood (1–5)"
              stroke="var(--chart-1)"
              strokeWidth={2}
              connectNulls
            />
            <Line
              yAxisId="scores"
              type="monotone"
              dataKey="phq9"
              name="PHQ-9 score"
              stroke="var(--chart-2)"
              strokeWidth={2}
              connectNulls
            />
            <Line
              yAxisId="scores"
              type="monotone"
              dataKey="gad7"
              name="GAD-7 score"
              stroke="var(--chart-3)"
              strokeWidth={2}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Disclaimer variant="scores" />
    </section>
  );
}
