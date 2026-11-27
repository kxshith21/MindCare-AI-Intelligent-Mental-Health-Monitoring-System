import type { Metadata } from "next";
import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";

export const metadata: Metadata = { title: "Safety | MindCare AI" };

/** Static safety information; support resources never depend on the API. */
export default function SafetyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Safety</h1>
        <p className="text-sm text-muted-foreground">
          MindCare AI is a reflection and check-in tool. It is not a therapist
          or a crisis service, and it cannot respond to emergencies.
        </p>
      </div>

      <CrisisResources />

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">What to keep in mind</h2>
        <ul className="list-disc gap-1 pl-5 text-muted-foreground">
          <li>
            If you may hurt yourself or someone else, contact local emergency
            services now.
          </li>
          <li>
            Risk flags are triage signals for a human reviewer. They are
            imperfect and can be missed, so never rely on them for safety.
          </li>
          <li>
            Chat message text is sent to a third-party LLM provider to generate
            replies and screening signals.
          </li>
          <li>
            Psychologists only see what your care link&apos;s share_scope allows,
            and access is logged.
          </li>
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">
        Read the{" "}
        <Link href="/privacy" className="underline">
          Privacy notice
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        for more information.
      </p>
    </div>
  );
}
