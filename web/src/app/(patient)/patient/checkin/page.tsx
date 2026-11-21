import { PagePlaceholder } from "@/components/page-placeholder";

export default function PatientCheckinPage() {
  return (
    <PagePlaceholder
      title="Check-in"
      description="Mood rating with optional PHQ-9/GAD-7 questions. Built in Phase 4."
      route="/patient/checkin"
    />
  );
}
