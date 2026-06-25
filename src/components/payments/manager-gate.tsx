/**
 * Manager-PIN gate. Wrap the screen in <ManagerGateProvider> and call
 * `useManagerGate().requireManager()` before a sensitive action; it resolves
 * true when the gate is open (no PIN required/set) or the correct PIN is
 * entered, and false if the cashier cancels.
 *
 * This is a deterrent for a single trusted register, not authentication.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { isGateActive, verifyManagerPin } from "@/lib/pos/auth";

interface GateContext {
  /** Resolve true if allowed (gate open or correct PIN), false if cancelled. */
  requireManager: (reason?: string) => Promise<boolean>;
}

const Ctx = createContext<GateContext | null>(null);

export function useManagerGate(): GateContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useManagerGate must be used within ManagerGateProvider");
  return ctx;
}

export function ManagerGateProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const requireManager = useCallback(async (why?: string) => {
    // Pass straight through when no PIN is required or none is set.
    if (!(await isGateActive())) return true;
    setReason(why ?? "");
    setPin("");
    setError(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function finish(ok: boolean) {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }

  async function submit() {
    if (await verifyManagerPin(pin)) {
      finish(true);
    } else {
      setError(true);
      setPin("");
    }
  }

  return (
    <Ctx.Provider value={{ requireManager }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> {t("payments.gate.title")}
            </DialogTitle>
            <DialogDescription>
              {reason ? `${reason}. ` : ""}{t("payments.gate.enterPin")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="manager-pin">{t("payments.gate.managerPin")}</Label>
            <Input
              id="manager-pin"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {error && (
              <p className="text-destructive text-xs">{t("payments.gate.incorrectPin")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => finish(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit}>{t("payments.gate.approve")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
