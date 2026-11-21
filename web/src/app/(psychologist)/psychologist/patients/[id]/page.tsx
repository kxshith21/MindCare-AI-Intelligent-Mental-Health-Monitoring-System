import { PagePlaceholder } from "@/components/page-placeholder";

// Patient detail reads dynamic params on every request — not statically prerendered.
export const instant = false;

export default async function PsychologistPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PagePlaceholder
      title={`Patient ${id}`}
      description="Per-patient trend chart (check-in scores over time), respecting the active care-link scope. Built in Phase 4."
      route={`/psychologist/patients/${id}`}
    />
  );
}
