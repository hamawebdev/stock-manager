import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { cn } from "@/lib/utils";
import { isValidEan13, type BarcodeSymbology } from "@/lib/pos/barcode";

interface Props {
  value: string;
  symbology: BarcodeSymbology;
  height?: number;
  className?: string;
}

/**
 * Renders a scannable barcode to SVG via JsBarcode. The barcode is always drawn
 * on a white background with black bars (regardless of theme) so it scans and
 * prints correctly. EAN-13 is validated before rendering.
 */
export function BarcodePreview({
  value,
  symbology,
  height = 50,
  className,
}: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !value) {
      setError(null);
      return;
    }
    if (symbology === "ean13" && !isValidEan13(value)) {
      setError("Not a valid EAN-13 (needs 13 digits incl. check digit)");
      return;
    }
    try {
      JsBarcode(el, value, {
        format: symbology === "ean13" ? "EAN13" : "CODE128",
        height,
        displayValue: true,
        margin: 6,
        fontSize: 13,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [value, symbology, height]);

  if (!value) {
    return (
      <div className={cn("text-muted-foreground text-xs italic", className)}>
        No barcode yet
      </div>
    );
  }

  return (
    <div className={className}>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <div className="inline-block rounded-md border bg-white p-2">
          <svg ref={ref} className="block max-w-full" />
        </div>
      )}
    </div>
  );
}
