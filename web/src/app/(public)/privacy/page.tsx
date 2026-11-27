import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy notice | MindCare AI" };

/** Static, plain-language summary of the data handled by the current app. */
export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="text-sm text-muted-foreground">
          A plain-language summary of what MindCare AI stores and who can see it.
        </p>
      </div>

      <p
        role="note"
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium"
      >
        DRAFT - requires legal review before launch
      </p>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">What we store</h2>
        <p className="text-muted-foreground">
          Your account details (email, display name and optional region), mood
          check-ins with questionnaire answers and notes, chat messages, care
          links, clinician notes about you, risk flags and access-log entries.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">AI chat and other services</h2>
        <p className="text-muted-foreground">
          When you send a chat message, its text is sent to a third-party LLM
          provider configured by the service operator. The provider generates a
          supportive reply and screening signals. MindCare uses Supabase to
          store account and app data. MindCare AI is not a therapist or a crisis
          service.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Who can see your information</h2>
        <p className="text-muted-foreground">
          Your information stays in your account unless you invite a psychologist
          and they accept the care link. Psychologists only see what your link&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">share_scope</code>{" "}
          allows. &quot;Summary only&quot; shows mood, screening scores and dates;
          &quot;full&quot; also shows chat messages, questionnaire answers and
          check-in notes. A psychologist may also keep private notes that
          patients cannot read. You can change the scope or revoke the link in
          Care team.
        </p>
        <p className="text-muted-foreground">
          Every time a psychologist views your data, an access-log entry is
          recorded.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Risk flags</h2>
        <p className="text-muted-foreground">
          Risk flags are triage signals for a human reviewer. They are imperfect
          and can be missed. They are not a guarantee of safety and do not
          replace emergency help.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <h2 className="font-semibold">Deleting your data</h2>
        <p className="text-muted-foreground">
          In Settings, choose &quot;Delete my account&quot; and type DELETE to
          confirm. This permanently removes your check-ins, chats, care links,
          clinician notes and sign-in account. It cannot be undone.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Read the{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/safety" className="underline">
          Safety
        </Link>{" "}
        pages for more context.
      </p>
    </div>
  );
}
