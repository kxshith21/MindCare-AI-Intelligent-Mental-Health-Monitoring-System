import Link from "next/link";
import { CrisisResources } from "@/components/crisis-resources";
import { Button } from "@/components/ui/button";

export default function GoodbyePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Goodbye</h1>
        <p className="text-sm text-muted-foreground">
          Your MindCare account and its data have been deleted. You are signed
          out.
        </p>
      </div>
      <CrisisResources />
      <Button asChild variant="outline" className="self-start">
        <Link href="/">Return home</Link>
      </Button>
    </div>
  );
}
