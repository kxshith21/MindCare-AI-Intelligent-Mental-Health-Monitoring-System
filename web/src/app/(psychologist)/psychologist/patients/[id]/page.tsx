import { Suspense } from "react";
import { LoadingState } from "@/components/loading-state";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PatientDetail } from "./patient-detail";

// Patient detail reads dynamic params and session-scoped data on every request.
export const instant = false;

export default function PsychologistPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading this patient…" />}>
      <PatientDetailPageContent params={params} />
    </Suspense>
  );
}

async function PatientDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", id)
    .maybeSingle();

  return (
    <PatientDetail patientId={id} displayName={data?.display_name ?? "Patient"} />
  );
}
