/**
 * Keyboard shortcuts cheat-sheet. Opened with F1 or `?` (see PosHotkeys) and
 * grouped by task so a cashier can learn/recall the register keys at a glance.
 * The list here is presentational only — the bindings themselves live in
 * PosHotkeys; keep the two in sync when adding a shortcut.
 */
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePosUiStore } from "@/store/use-pos-ui-store";

interface Group {
  title: string;
  items: { keys: string[]; label: string }[];
}

export function ShortcutsDialog() {
  const { t } = useTranslation();
  const open = usePosUiStore((s) => s.helpOpen);
  const setOpen = usePosUiStore((s) => s.setHelpOpen);

  const groups: Group[] = [
    {
      title: t("payments.shortcuts.groups.register"),
      items: [
        { keys: ["F3"], label: t("payments.actions.new") },
        { keys: ["F4"], label: t("payments.actions.returns") },
        { keys: ["F6"], label: t("payments.actions.suspend") },
        { keys: ["F7"], label: t("payments.actions.resume") },
        { keys: ["F10"], label: t("payments.actions.printLast") },
      ],
    },
    {
      title: t("payments.shortcuts.groups.checkout"),
      items: [
        { keys: ["F2"], label: t("payments.shortcuts.charge") },
        { keys: ["F8"], label: t("payments.actions.customer") },
      ],
    },
    {
      title: t("payments.shortcuts.groups.cart"),
      items: [
        { keys: ["↑", "↓"], label: t("payments.shortcuts.selectLine") },
        { keys: ["+", "−"], label: t("payments.shortcuts.qty") },
        { keys: ["Alt", "P"], label: t("payments.cart.editPrice") },
        { keys: ["Alt", "D"], label: t("payments.shortcuts.discount") },
        { keys: ["Alt", "N"], label: t("payments.cart.lineNote") },
        { keys: ["Del"], label: t("payments.cart.removeItem") },
      ],
    },
    {
      title: t("payments.shortcuts.groups.navigation"),
      items: [
        { keys: ["/"], label: t("payments.shortcuts.focusSearch") },
        { keys: ["Alt", "H"], label: t("payments.actions.history") },
        { keys: ["F9"], label: t("payments.actions.cashRegister") },
        { keys: ["F1", "?"], label: t("payments.shortcuts.help") },
        { keys: ["Esc"], label: t("payments.shortcuts.escape") },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("payments.shortcuts.title")}</DialogTitle>
          <DialogDescription>
            {t("payments.shortcuts.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="space-y-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {g.title}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li
                    key={it.label}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{it.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="bg-muted text-muted-foreground inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 font-mono text-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
