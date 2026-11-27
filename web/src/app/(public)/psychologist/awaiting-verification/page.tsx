import { LogoutButton } from "@/components/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Dedicated landing for unverified psychologists (see src/proxy.ts). */
export default function AwaitingVerificationPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Account awaiting verification</CardTitle>
          <CardDescription>
            Your license is being reviewed by the MindCare team. You can log
            in, but no patient information is visible until your account is
            verified. Verification happens manually — see docs/RLS.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
