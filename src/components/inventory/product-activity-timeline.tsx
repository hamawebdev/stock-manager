import { format } from "date-fns";
import {
  Archive,
  Copy,
  Pencil,
  PlusCircle,
  History as HistoryIcon,
} from "lucide-react";
import { useActivity } from "@/lib/pos/queries";

const ICONS: Record<string, typeof PlusCircle> = {
  created: PlusCircle,
  updated: Pencil,
  archived: Archive,
  duplicated: Copy,
};

/**
 * Coarse product activity timeline (create / edit / duplicate / archive),
 * sourced from the activity_log. Fine-grained stock changes live in the
 * inventory movements ledger.
 */
export function ProductActivityTimeline({ productId }: { productId: number }) {
  const activity = useActivity("product", productId);
  const entries = activity.data ?? [];

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l pl-4">
      {entries.map((e) => {
        const Icon = ICONS[e.action] ?? HistoryIcon;
        return (
          <li key={e.id} className="relative">
            <span className="bg-background absolute -left-[1.55rem] flex size-6 items-center justify-center rounded-full border">
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-medium capitalize">{e.action}</p>
            {e.detail && (
              <p className="text-muted-foreground text-xs">{e.detail}</p>
            )}
            <p className="text-muted-foreground text-xs">
              {format(new Date(e.created_at), "yyyy-MM-dd HH:mm")}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
