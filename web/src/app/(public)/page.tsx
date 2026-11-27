import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <Badge variant="outline" className="mb-4">
        MindCare AI
      </Badge>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        A calm space to check in with yourself
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Mood check-ins, supportive AI conversations, and progress sharing with a
        psychologist you choose — consent-based, always under your control.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/signup">Create account</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
      <Card className="mt-12 w-full max-w-md text-left">
        <CardHeader>
          <CardTitle className="text-base">About this space</CardTitle>
          <CardDescription>
            MindCare AI offers reflection, check-ins and consent-based progress
            sharing. It is not a crisis service or a substitute for professional
            care.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If you need immediate support, the resources below are available
          whether or not you have an account.
          <div className="mt-4 text-left">
            <CrisisResources />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
