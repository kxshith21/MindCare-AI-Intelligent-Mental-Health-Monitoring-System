import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of use | MindCare AI" };

/** Static, plain-language summary of the rules for using the current app. */
export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Terms of use</h1>
        <p className="text-sm text-muted-foreground">
          The ground rules for using MindCare AI. This page is a draft, not a
          signed agreement.
        </p>
      </div>

      <p
        role="note"
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium"
      >
        DRAFT - requires legal review before launch
      </p>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Who can use this service</h2>
        <p className="text-muted-foreground">
          MindCare AI is for adults aged 18 or older. Patient accounts provide
          check-ins and chat. Psychologist accounts are manually verified and
          can only see patient data through a care link the patient accepted.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">What MindCare AI is</h2>
        <p className="text-muted-foreground">
          A self-reflection and check-in tool. The AI chat is supportive, but it
          is not a therapist or a crisis service, and using it does not create a
          clinical relationship. If you need immediate help, contact local
          emergency services. The{" "}
          <Link href="/safety" className="underline">
            Safety
          </Link>{" "}
          page lists support resources.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Screening and risk flags</h2>
        <p className="text-muted-foreground">
          Check-ins use screening questions, and risk flags are triage signals
          for a human reviewer. Flags are imperfect and can be missed; never
          rely on them for safety.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Sharing and your data</h2>
        <p className="text-muted-foreground">
          Chat message text is sent to a third-party LLM provider to generate
          replies and screening signals. Psychologists only see what your
          care link&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">share_scope</code>{" "}
          allows, and access is logged. You can delete your account and its data
          in Settings with &quot;Delete my account&quot;. See the{" "}
          <Link href="/privacy" className="underline">
            Privacy notice
          </Link>{" "}
          for details.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Using the service responsibly</h2>
        <p className="text-muted-foreground">
          Keep your password private, do not use the chat for emergencies, and
          do not submit other people&apos;s private information. Accounts may be
          removed if they are misused.
        </p>
      </section>
    </div>
  );
}
