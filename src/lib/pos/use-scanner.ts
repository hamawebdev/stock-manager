import { useEffect, useRef } from "react";

/**
 * Capture input from a keyboard-wedge barcode scanner. Such scanners "type"
 * the barcode very fast and send Enter at the end. We distinguish them from
 * human typing by the inter-keystroke gap: anything faster than `maxGapMs`
 * across the whole token is treated as a scan.
 *
 * Works globally (document-level), so the cashier can scan without focusing a
 * field. Plain typing into inputs still works normally.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  options: { enabled?: boolean; minLength?: number; maxGapMs?: number } = {},
) {
  const { enabled = true, minLength = 3, maxGapMs = 50 } = options;
  const buffer = useRef("");
  const lastTime = useRef(0);
  const fast = useRef(true);
  // Keep the latest callback without re-binding the listener each render.
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastTime.current;
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current;
        const wasFast = fast.current;
        buffer.current = "";
        fast.current = true;
        if (code.length >= minLength && wasFast) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }

      // Only printable single characters form a barcode.
      if (e.key.length !== 1) return;

      // A long pause means this is human typing, not a scan burst.
      if (buffer.current && gap > maxGapMs) fast.current = false;
      buffer.current += e.key;

      // Reset the burst window shortly after the last keystroke.
      window.setTimeout(() => {
        if (Date.now() - lastTime.current >= maxGapMs * 4) {
          buffer.current = "";
          fast.current = true;
        }
      }, maxGapMs * 5);
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, minLength, maxGapMs]);
}
