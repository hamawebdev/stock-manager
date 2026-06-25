/**
 * Cash register, in a side sheet so it never blocks the till. The shop owner
 * opens a session with a float at the start of the day, records pay-ins /
 * pay-outs as cash moves through the drawer, and closes by counting the till —
 * either typing the total or using the denomination counter — to see the
 * variance against what the drawer should hold.
 *
 * Pay-out and close are permission-gated.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calculator, History, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  useOpenSession,
  useCashBreakdown,
  useOpenCashSession,
  useAddCashEvent,
  useCloseCashSession,
  useCurrency,
} from "@/lib/pos/queries";
import { formatMoney, parseMoney } from "@/lib/money";
import { intlLocale } from "@/lib/i18n";
import { useManagerGate } from "./manager-gate";
import { DenominationCounter } from "./denomination-counter";
import { CashHistoryDialog } from "./cash-history-dialog";

export function CashRegisterSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const session = useOpenSession();
  const current = session.data ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="size-4" /> {t("payments.cash.title")}
          </SheetTitle>
          <SheetDescription>{t("payments.cash.description")}</SheetDescription>
        </SheetHeader>
        {session.isLoading ? null : current ? (
          <OpenSessionView
            sessionId={current.id}
            openedAt={current.opened_at}
            onShowHistory={() => setHistoryOpen(true)}
          />
        ) : (
          <OpenRegisterForm onShowHistory={() => setHistoryOpen(true)} />
        )}
        <CashHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      </SheetContent>
    </Sheet>
  );
}

function OpenRegisterForm({ onShowHistory }: { onShowHistory: () => void }) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const openSession = useOpenCashSession();
  const [floatStr, setFloatStr] = useState("");
  const [cashier, setCashier] = useState("");
  const [note, setNote] = useState("");

  async function handleOpen() {
    const cents = parseMoney(floatStr || "0", currency.decimals);
    if (cents == null) {
      toast.error(t("payments.cash.invalidAmount"));
      return;
    }
    try {
      await openSession.mutateAsync({
        floatCents: cents,
        cashierName: cashier,
        openingNote: note,
      });
      toast.success(t("payments.cash.registerOpened"));
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="cashier">{t("payments.insights.cashier")}</Label>
        <Input
          id="cashier"
          value={cashier}
          onChange={(e) => setCashier(e.target.value)}
          placeholder={t("payments.cash.cashierPlaceholder")}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="float">
          {t("payments.cash.openingFloat")}{currency.symbol ? ` (${currency.symbol})` : ""}
        </Label>
        <Input
          id="float"
          inputMode="decimal"
          value={floatStr}
          onChange={(e) => setFloatStr(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="open-note">{t("payments.cash.openingNote")}</Label>
        <Textarea
          id="open-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("payments.cash.openingNotePlaceholder")}
        />
      </div>
      <Button onClick={handleOpen} disabled={openSession.isPending}>
        <Wallet /> {t("payments.cash.openRegister")}
      </Button>
      <Button variant="ghost" onClick={onShowHistory}>
        <History /> {t("payments.actions.history")}
      </Button>
    </div>
  );
}

function OpenSessionView({
  sessionId,
  openedAt,
  onShowHistory,
}: {
  sessionId: number;
  openedAt: string;
  onShowHistory: () => void;
}) {
  const { t } = useTranslation();
  const currency = useCurrency();
  const session = useOpenSession();
  const breakdown = useCashBreakdown(session.data ?? null);
  const addEvent = useAddCashEvent();
  const closeSession = useCloseCashSession();
  const { requireManager } = useManagerGate();

  const [form, setForm] = useState<null | "pay_in" | "pay_out" | "close">(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [counted, setCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [breakdownJson, setBreakdownJson] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  const b = breakdown.data;
  const fmt = (cents: number | undefined) =>
    cents == null ? "…" : formatMoney(cents, currency);

  async function openForm(which: "pay_in" | "pay_out" | "close") {
    if (which === "pay_out" || which === "close") {
      const ok = await requireManager(
        which === "close" ? t("payments.cash.closeReason") : t("payments.cash.payOutReason"),
      );
      if (!ok) return;
    }
    setAmount("");
    setReason("");
    setCounted("");
    setCloseNote("");
    setBreakdownJson(null);
    setForm(which);
  }

  async function submitEvent() {
    const cents = parseMoney(amount || "0", currency.decimals);
    if (cents == null || cents <= 0) {
      toast.error(t("payments.cash.invalidAmount"));
      return;
    }
    try {
      await addEvent.mutateAsync({
        sessionId,
        kind: form as "pay_in" | "pay_out",
        amountCents: cents,
        reason: reason.trim() || null,
      });
      toast.success(t("payments.cash.recorded"));
      setForm(null);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function submitClose() {
    const cents = parseMoney(counted || "0", currency.decimals);
    if (cents == null) {
      toast.error(t("payments.cash.enterCounted"));
      return;
    }
    try {
      const result = await closeSession.mutateAsync({
        sessionId,
        countedCents: cents,
        closingNote: closeNote,
        breakdownJson,
      });
      const v = result.variance_cents ?? 0;
      const label = v === 0 ? t("payments.cash.balanced") : v > 0 ? t("payments.cash.over") : t("payments.cash.short");
      toast.success(
        t("payments.cash.registerClosed", { label, amount: formatMoney(Math.abs(v), currency) }),
      );
      setForm(null);
    } catch (err) {
      toast.error(String(err));
    }
  }

  const countedCents = counted ? parseMoney(counted, currency.decimals) : null;
  const variance =
    countedCents != null && b ? countedCents - b.expected_cents : null;

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-xs">
        {t("payments.cash.openedAt", { datetime: new Date(openedAt).toLocaleString(intlLocale()) })}
      </p>

      <div className="space-y-2 rounded-md border p-3">
        <Row label={t("payments.cash.openingFloat")} value={fmt(b?.opening_float_cents)} />
        <Row label={t("payments.cash.totalCashCollected")} value={fmt(b?.cash_collected_cents)} />
        <div className="flex items-center justify-between border-t pt-2">
          <span className="font-semibold">{t("payments.cash.theoreticalTotal")}</span>
          <span className="text-xl font-bold">{fmt(b?.expected_cents)}</span>
        </div>
      </div>

      {form === null ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openForm("pay_in")}>
            {t("payments.cash.payIn")}
          </Button>
          <Button variant="outline" onClick={() => openForm("pay_out")}>
            {t("payments.cash.payOut")}
          </Button>
          <Button className="ms-auto" onClick={() => openForm("close")}>
            {t("payments.cash.closeRegister")}
          </Button>
        </div>
      ) : form === "close" ? (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-sm font-medium">{t("payments.cash.closeReconcile")}</p>
          <div className="grid gap-2">
            <Label>{t("payments.cash.countedTotal")}</Label>
            <Input
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
            <Button
              type="button"
              variant="link"
              className="h-auto justify-start p-0 text-sm"
              onClick={() => setCounterOpen(true)}
            >
              <Calculator className="size-3.5" /> {t("payments.cash.useCashCounter")}
            </Button>
            {variance != null && (
              <p
                className={`text-sm font-medium ${
                  variance === 0 ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {t("payments.cash.variance")}: {variance > 0 ? "+" : ""}
                {formatMoney(variance, currency)}
                {" ("}
                {variance === 0
                  ? t("payments.cash.balanced")
                  : variance > 0
                    ? t("payments.cash.over")
                    : t("payments.cash.short")}
                {")"}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>{t("payments.cash.closingNote")}</Label>
            <Textarea
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder={t("payments.cash.closingNotePlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitClose} disabled={closeSession.isPending}>
              {t("payments.cash.closeRegister")}
            </Button>
          </div>
          <DenominationCounter
            open={counterOpen}
            onOpenChange={setCounterOpen}
            onUse={(totalCents, json) => {
              setCounted(formatMoney(totalCents, { symbol: "", decimals: currency.decimals }));
              setBreakdownJson(json);
            }}
          />
        </div>
      ) : (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-sm font-medium">
            {form === "pay_in" ? t("payments.cash.payIn") : t("payments.cash.payOut")}
          </p>
          <div className="grid gap-2">
            <Label>{t("payments.cash.amount")}</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("payments.cash.reason")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={form === "pay_in" ? t("payments.cash.payInPlaceholder") : t("payments.cash.payOutPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitEvent} disabled={addEvent.isPending}>
              {t("payments.cash.record")}
            </Button>
          </div>
        </div>
      )}

      <Button variant="ghost" onClick={onShowHistory}>
        <History /> {t("payments.actions.history")}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
