/**
 * Central keyboard-shortcut handler for the POS workspace. A single
 * document-level listener dispatches every register shortcut so a cashier can
 * run the page with minimal mouse use.
 *
 * Design rules (agreed with the cashier UX spec):
 *  - Function keys (F1–F10) and modifier combos (Alt+…) are the primary
 *    bindings. They fire even while a text field is focused, so the cashier can
 *    charge (F2) or start a return (F4) without leaving the search box.
 *  - Bare printable keys (`/`, `?`, `+`, `-`, arrows) only act when no text
 *    field is focused, so plain typing and the price/note inputs are never
 *    hijacked.
 *  - Nothing collides with the keyboard-wedge barcode scanner, which only emits
 *    printable single characters in fast bursts plus Enter — never F-keys,
 *    Alt-combos, or arrows.
 *  - While a modal sheet is open the page hotkeys stand down (`enabled=false`)
 *    and let the sheet own the keyboard, matching the scanner's behaviour.
 */
import { useEffect, useRef } from "react";
import { useCartStore } from "@/store/use-cart-store";
import { usePosUiStore } from "@/store/use-pos-ui-store";

export interface PosHotkeyActions {
  onNewSale: () => void;
  onStartReturn: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onOpenCustomer: () => void;
  onOpenCash: () => void;
  onOpenHistory: () => void;
  onPrintLast: () => void;
  /** Page hotkeys are suppressed while a modal sheet owns the keyboard. */
  enabled: boolean;
}

/** True when focus is in a field where plain typing must win over bare keys. */
function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
}

/** Fire the real click handler of a selected line's price/discount/note trigger. */
function clickLineAction(
  variantId: number,
  action: "price" | "discount" | "note",
) {
  const el = document.querySelector<HTMLElement>(
    `[data-cart-line="${variantId}"] [data-line-action="${action}"]`,
  );
  // Price/note carry the attribute on their trigger button directly; the shared
  // DiscountPopover is wrapped, so fall back to its inner button.
  const btn =
    el instanceof HTMLButtonElement
      ? el
      : el?.querySelector<HTMLButtonElement>("button");
  btn?.click();
}

export function PosHotkeys(actions: PosHotkeyActions) {
  // Keep the freshest callbacks/enabled without re-binding the listener; the
  // handler reads store state imperatively so it never goes stale either.
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  });

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const a = actionsRef.current;
      const ui = usePosUiStore.getState();

      // F1 toggles the help overlay. Only when the page owns the keyboard (no
      // sheet open) or when help itself is up (so F1 can close it) — never stack
      // it over a modal sheet. Esc closing is handled by the dialog.
      if (e.key === "F1") {
        if (a.enabled || ui.helpOpen) {
          e.preventDefault();
          ui.setHelpOpen(!ui.helpOpen);
        }
        return;
      }

      // While a sheet or the help overlay owns the screen, stand down. Esc still
      // blurs a focused field (handy inside sheets), everything else defers.
      if (!a.enabled || ui.helpOpen) {
        if (e.key === "Escape" && isEditableTarget(document.activeElement)) {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      const editable = isEditableTarget(document.activeElement);

      // Esc: blur the current field so bare-key shortcuts become available.
      if (e.key === "Escape") {
        if (editable) {
          e.preventDefault();
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      // --- Primary actions: F-keys + Alt combos. Fire regardless of focus. ---
      switch (e.key) {
        case "F2": // Charge / Refund
          e.preventDefault();
          ui.submit?.();
          return;
        case "F3": // New sale
          e.preventDefault();
          a.onNewSale();
          return;
        case "F4": // Start return
          e.preventDefault();
          a.onStartReturn();
          return;
        case "F6": // Suspend
          e.preventDefault();
          a.onSuspend();
          return;
        case "F7": // Resume held sale
          e.preventDefault();
          a.onResume();
          return;
        case "F8": // Customer
          e.preventDefault();
          a.onOpenCustomer();
          return;
        case "F9": // Cash register
          e.preventDefault();
          a.onOpenCash();
          return;
        case "F10": // Print last receipt
          e.preventDefault();
          a.onPrintLast();
          return;
      }

      // Alt combos. Alt+H history; Alt+P/D/N edit the selected line.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "h") {
          e.preventDefault();
          a.onOpenHistory();
          return;
        }
        const sel = ui.selectedLineId;
        if (sel != null && (k === "p" || k === "d" || k === "n")) {
          e.preventDefault();
          clickLineAction(
            sel,
            k === "p" ? "price" : k === "d" ? "discount" : "note",
          );
          return;
        }
      }

      // --- Bare keys: only when not typing in a field. ---
      if (editable || e.ctrlKey || e.altKey || e.metaKey) return;

      const { lines, setQty } = useCartStore.getState();

      switch (e.key) {
        case "/": // Focus product search
          e.preventDefault();
          document
            .querySelector<HTMLInputElement>("[data-pos-search]")
            ?.focus();
          return;
        case "?": // Help (Shift+/)
          e.preventDefault();
          ui.setHelpOpen(true);
          return;
        case "ArrowDown":
        case "ArrowUp": {
          if (lines.length === 0) return;
          e.preventDefault();
          const ids = lines.map((l) => l.variant.id);
          const cur = ui.selectedLineId;
          const idx = cur == null ? -1 : ids.indexOf(cur);
          let next: number;
          if (e.key === "ArrowDown") {
            next = idx < 0 ? ids[0] : ids[Math.min(idx + 1, ids.length - 1)];
          } else {
            next = idx < 0 ? ids[ids.length - 1] : ids[Math.max(idx - 1, 0)];
          }
          ui.setSelectedLineId(next);
          return;
        }
        case "+":
        case "=": {
          const sel = ui.selectedLineId;
          const line = lines.find((l) => l.variant.id === sel);
          if (!line) return;
          e.preventDefault();
          setQty(line.variant.id, line.qty + 1);
          return;
        }
        case "-": {
          const sel = ui.selectedLineId;
          const line = lines.find((l) => l.variant.id === sel);
          if (!line) return;
          e.preventDefault();
          setQty(line.variant.id, line.qty - 1);
          return;
        }
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // Bound once — the handler reads the latest props/state via refs & stores.
  }, []);

  return null;
}
