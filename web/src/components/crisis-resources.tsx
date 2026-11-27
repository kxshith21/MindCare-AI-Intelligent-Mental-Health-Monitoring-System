import type { CrisisResource } from "@/lib/types";

/**
 * Static last-resort list mirrored from api/app/services/crisis_resources.py.
 * It is rendered when an API call or a component fails, so support information
 * never depends on the backend being healthy.
 */
export const FALLBACK_CRISIS_RESOURCES: readonly CrisisResource[] = [
  {
    name: "Find a Helpline",
    contact: "findahelpline.com",
    detail: "Find free, confidential support services in your country.",
    last_verified: "2026-11-27",
  },
  {
    name: "Local emergency services",
    contact: "your local emergency number",
    detail: "If you may hurt yourself or someone else, contact local emergency services now.",
    last_verified: "2026-11-27",
  },
];

interface CrisisResourcesProps {
  resources?: readonly CrisisResource[];
  title?: string;
  description?: string;
}

/** Always-visible, never collapsed support panel. */
export function CrisisResources({
  resources = FALLBACK_CRISIS_RESOURCES,
  title = "Support right now",
  description = "MindCare AI is not a crisis service. If you need immediate help, these services can support you.",
}: CrisisResourcesProps) {
  const list = resources.length > 0 ? resources : FALLBACK_CRISIS_RESOURCES;

  return (
    <section
      aria-label="Crisis support resources"
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <h2 className="font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {list.map((resource) => (
          <li
            key={`${resource.name}-${resource.contact}`}
            className="rounded-lg bg-background/70 p-3"
          >
            <p className="font-medium">{resource.name}</p>
            <p className="mt-0.5 font-mono text-sm">{resource.contact}</p>
            <p className="mt-1 text-xs text-muted-foreground">{resource.detail}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Checked {resource.last_verified}. Contact details can change.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
