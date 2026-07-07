/**
 * Quick actions bar: one-click access to the common register operations —
 * new sale, start a return (flips the shared cart into return mode),
 * suspend/resume, and the customer / cash / history panels.
 */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  PauseCircle,
  PlayCircle,
  Inbox,
  Wallet,
  History,
  Printer,
  Trash2,
  Undo2,
  Keyboard,
} from "lucide-react";
import type { HeldSale } from "@/lib/pos/held";

export interface QuickActionsProps {
  onNewSale: () => void;
  onStartReturn: () => void;
  onSuspend: () => void;
  onResume: (id: number) => void;
  onDiscardHeld: (id: number) => void;
  heldSales: HeldSale[];
  onOpenCash: () => void;
  onOpenHistory: () => void;
  onPrintLast: () => void;
  cartHasItems: boolean;
  /** Controlled open state for the Resume menu so F7 can open it. */
  resumeOpen: boolean;
  onResumeOpenChange: (open: boolean) => void;
  /** Open the keyboard-shortcuts cheat-sheet. */
  onShowShortcuts: () => void;
}

export function QuickActionsBar(props: QuickActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={props.onNewSale}>
        <Plus /> {t("payments.actions.new")}
      </Button>

      <Button size="sm" variant="secondary" onClick={props.onStartReturn}>
        <Undo2 /> {t("payments.actions.returns")}
      </Button>

      <Button
        size="sm"
        variant="outline"
        onClick={props.onSuspend}
        disabled={!props.cartHasItems}
      >
        <PauseCircle /> {t("payments.actions.suspend")}
      </Button>

      <DropdownMenu open={props.resumeOpen} onOpenChange={props.onResumeOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <PlayCircle /> {t("payments.actions.resume")}
            {props.heldSales.length > 0 && (
              <Badge variant="secondary" className="ms-1">
                {props.heldSales.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {props.heldSales.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-sm">
              {t("payments.actions.noSuspended")}
            </div>
          ) : (
            props.heldSales.map((h) => (
              <DropdownMenuItem
                key={h.id}
                onSelect={(e) => {
                  e.preventDefault();
                  props.onResume(h.id);
                }}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Inbox className="size-4" />
                  <span className="truncate">{h.label}</span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDiscardHeld(h.id);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="bg-border mx-1 h-5 w-px" />

      <Button size="sm" variant="outline" onClick={props.onOpenCash}>
        <Wallet /> {t("payments.actions.cashRegister")}
      </Button>
      <Button size="sm" variant="outline" onClick={props.onOpenHistory}>
        <History /> {t("payments.actions.history")}
      </Button>
      <Button size="sm" variant="outline" onClick={props.onPrintLast}>
        <Printer /> {t("payments.actions.printLast")}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="ms-auto"
        onClick={props.onShowShortcuts}
        title={t("payments.shortcuts.title")}
        aria-label={t("payments.shortcuts.title")}
      >
        <Keyboard />
        <kbd className="text-muted-foreground ms-1 hidden font-mono text-xs sm:inline">
          F1
        </kbd>
      </Button>
    </div>
  );
}
