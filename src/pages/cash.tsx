import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wallet } from "lucide-react";
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

export default function CashPage() {
  const currency = useCurrency();
  const session = useOpenSession();
  const open = session.data ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cash</h1>
        <p className="text-muted-foreground text-sm">
          Open the register with a float, then reconcile at close.
        </p>
      </div>
      {session.isLoading ? null : open ? (
        <OpenSessionView sessionId={open.id} openedAt={open.opened_at} />
      ) : (
        <OpenRegisterCard />
      )}
    </div>
  );

  function OpenRegisterCard() {
    const openSession = useOpenCashSession();
    const [floatStr, setFloatStr] = useState("");

    async function handleOpen() {
      const cents = parseMoney(floatStr || "0", currency.decimals);
      if (cents == null) {
        toast.error("Enter a valid amount");
        return;
      }
      try {
        await openSession.mutateAsync(cents);
        toast.success("Register opened");
      } catch (err) {
        toast.error(String(err));
      }
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Register closed</CardTitle>
          <CardDescription>
            Enter the opening cash float to start a session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xs gap-2">
          <Label htmlFor="float">
            Opening float{currency.symbol ? ` (${currency.symbol})` : ""}
          </Label>
          <Input
            id="float"
            inputMode="decimal"
            value={floatStr}
            onChange={(e) => setFloatStr(e.target.value)}
            placeholder="0.00"
          />
        </CardContent>
        <CardFooter>
          <Button onClick={handleOpen} disabled={openSession.isPending}>
            <Wallet /> Open register
          </Button>
        </CardFooter>
      </Card>
    );
  }
}

function OpenSessionView({
  sessionId,
  openedAt,
}: {
  sessionId: number;
  openedAt: string;
}) {
  const currency = useCurrency();
  const session = useOpenSession();
  const breakdown = useCashBreakdown(session.data ?? null);
  const addEvent = useAddCashEvent();
  const closeSession = useCloseCashSession();

  const [eventOpen, setEventOpen] = useState<null | "pay_in" | "pay_out">(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState("");

  const b = breakdown.data;

  async function submitEvent() {
    const cents = parseMoney(amount || "0", currency.decimals);
    if (cents == null || cents <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await addEvent.mutateAsync({
        sessionId,
        kind: eventOpen!,
        amountCents: cents,
        reason: reason.trim() || null,
      });
      toast.success("Recorded");
      setEventOpen(null);
      setAmount("");
      setReason("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function submitClose() {
    const cents = parseMoney(counted || "0", currency.decimals);
    if (cents == null) {
      toast.error("Enter the counted amount");
      return;
    }
    try {
      const result = await closeSession.mutateAsync({ sessionId, countedCents: cents });
      const v = result.variance_cents ?? 0;
      const label = v === 0 ? "balanced" : v > 0 ? "over" : "short";
      toast.success(
        `Register closed — ${label} ${formatMoney(Math.abs(v), currency)}`,
      );
      setCloseOpen(false);
      setCounted("");
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Register open</CardTitle>
          <CardDescription>
            Opened {new Date(openedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Opening float" value={fmt(b?.opening_float_cents)} />
          <Row label="Cash sales" value={fmt(b?.sales_cents)} />
          <Row
            label="Returns paid out"
            value={b ? `-${formatMoney(b.returns_cash_out_cents, currency)}` : "…"}
          />
          <Row label="Pay-ins" value={fmt(b?.pay_in_cents)} />
          <Row
            label="Pay-outs"
            value={b ? `-${formatMoney(b.pay_out_cents, currency)}` : "…"}
          />
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-semibold">Expected in drawer</span>
            <span className="text-xl font-bold">{fmt(b?.expected_cents)}</span>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEventOpen("pay_in")}>
            Pay in
          </Button>
          <Button variant="outline" onClick={() => setEventOpen("pay_out")}>
            Pay out
          </Button>
          <Button className="ml-auto" onClick={() => setCloseOpen(true)}>
            Close register
          </Button>
        </CardFooter>
      </Card>

      {/* Pay in / out */}
      <Dialog open={!!eventOpen} onOpenChange={(o) => !o && setEventOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {eventOpen === "pay_in" ? "Pay in" : "Pay out"}
            </DialogTitle>
            <DialogDescription>
              {eventOpen === "pay_in"
                ? "Add cash to the drawer."
                : "Remove cash from the drawer."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. petty cash"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventOpen(null)}>
              Cancel
            </Button>
            <Button onClick={submitEvent} disabled={addEvent.isPending}>
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close / count */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close register</DialogTitle>
            <DialogDescription>
              Count the drawer and enter the total. Expected:{" "}
              {fmt(b?.expected_cents)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Counted cash</Label>
            <Input
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              autoFocus
            />
            {counted && b && (
              <p className="text-muted-foreground text-sm">
                Variance:{" "}
                {formatMoney(
                  (parseMoney(counted, currency.decimals) ?? 0) - b.expected_cents,
                  currency,
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitClose} disabled={closeSession.isPending}>
              Close &amp; reconcile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  function fmt(cents: number | undefined) {
    return cents == null ? "…" : formatMoney(cents, currency);
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
