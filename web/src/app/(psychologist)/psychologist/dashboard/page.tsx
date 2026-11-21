import Link from "next/link";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function PsychologistDashboardPage() {
  return (
    <>
      <PagePlaceholder
        title="Psychologist dashboard"
        description="Linked patients, their progress over time, and the risk-event queue. Built in Phase 4."
        route="/psychologist/dashboard"
      />
      <p className="mx-auto max-w-2xl px-4 text-center text-sm text-muted-foreground">
        Example patient route:{" "}
        <Link href="/psychologist/patients/1" className="underline">
          /psychologist/patients/1
        </Link>
      </p>
    </>
  );
}
