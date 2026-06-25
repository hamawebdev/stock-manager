import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Copy,
  Pencil,
  PlusCircle,
  History as HistoryIcon,
} from "lucide-react";
import { useActivity } from "@/lib/pos/queries";
import { useAppStore } from "@/store/use-app-store";
import { dateFnsLocale } from "@/lib/i18n";

const ACTION_KEYS = {
  created: "inventory.activity.created",
  updated: "inventory.activity.updated",
  archived: "inventory.activity.archived",
  duplicated: "inventory.activity.duplicated",
} as const;

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
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const locale = dateFnsLocale(language);
  const activity = useActivity("product", productId);
  const entries = activity.data ?? [];

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">{t("inventory.activity.none")}</p>
    );
  }

  return (
    <ol className="relative space-y-4 border-s ps-4">
      {entries.map((e) => {
        const Icon = ICONS[e.action] ?? HistoryIcon;
        const actionKey = ACTION_KEYS[e.action as keyof typeof ACTION_KEYS];
        return (
          <li key={e.id} className="relative">
            <span className="bg-background absolute -start-[1.55rem] flex size-6 items-center justify-center rounded-full border">
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-medium capitalize">{actionKey ? t(actionKey) : e.action}</p>
            {e.detail && (
              <p className="text-muted-foreground text-xs">{e.detail}</p>
            )}
            <p className="text-muted-foreground text-xs">
              {format(new Date(e.created_at), "yyyy-MM-dd HH:mm", { locale })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
