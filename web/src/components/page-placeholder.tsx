import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shared shell for Phase 1 placeholder pages. Real content lands in Phase 4.
 */
export function PagePlaceholder({
  title,
  description,
  route,
  note = "This page is a placeholder. The UI is wired up in Phase 4.",
}: {
  title: string;
  description: string;
  route: string;
  note?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader className="gap-2">
          <Badge variant="outline" className="w-fit">
            Placeholder
          </Badge>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Route: <code className="font-mono">{route}</code>
          </p>
          <p className="mt-2">{note}</p>
        </CardContent>
      </Card>
    </div>
  );
}
