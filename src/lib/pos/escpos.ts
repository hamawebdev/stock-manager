/**
 * ESC/POS command builder. We assemble the raw byte stream for thermal
 * printers here in TypeScript (testable, no native deps) and hand it to a
 * trivial Rust transport command that just writes the bytes to a USB device
 * or a TCP socket. Works for both receipts and (continuous) barcode labels.
 */

const ESC = 0x1b;
const GS = 0x1d;

export type Align = "left" | "center" | "right";

/** Accumulates ESC/POS bytes via a small fluent builder. */
export class EscPosBuilder {
  private bytes: number[] = [];

  /** Characters per line for the active paper width (48 ≈ 80mm, 32 ≈ 58mm). */
  constructor(public readonly cols = 48) {}

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  init(): this {
    return this.raw(ESC, 0x40); // ESC @  — reset
  }

  align(a: Align): this {
    const n = a === "center" ? 1 : a === "right" ? 2 : 0;
    return this.raw(ESC, 0x61, n); // ESC a n
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0); // ESC E n
  }

  /** Double width/height multiplier via GS ! n (0..7 each nibble). */
  size(w: 0 | 1, h: 0 | 1): this {
    return this.raw(GS, 0x21, (w << 4) | h); // GS ! n
  }

  /** Encode text in the printer's single-byte codepage (ASCII-safe). */
  text(s: string): this {
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0x3f;
      this.bytes.push(code < 0x100 ? code : 0x3f /* '?' */);
    }
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  /** A left/right justified row padded to the column width. */
  row(left: string, right: string): this {
    const space = Math.max(1, this.cols - left.length - right.length);
    return this.line(left + " ".repeat(space) + right);
  }

  rule(char = "-"): this {
    return this.line(char.repeat(this.cols));
  }

  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) this.bytes.push(0x0a);
    return this;
  }

  /** Code128 barcode with human-readable text below it. */
  barcode128(data: string, height = 80): this {
    this.raw(GS, 0x68, height); // GS h — height
    this.raw(GS, 0x77, 2); // GS w — module width
    this.raw(GS, 0x48, 2); // GS H — HRI text below barcode
    // GS k 73 n d1..dn  (code set B prefixed with '{B')
    const payload = [0x7b, 0x42, ...[...data].map((c) => c.charCodeAt(0))];
    return this.raw(GS, 0x6b, 73, payload.length, ...payload);
  }

  /** Open a connected cash drawer (ESC p m t1 t2). */
  drawerKick(): this {
    return this.raw(ESC, 0x70, 0, 25, 250);
  }

  /** Feed and partial-cut the paper. */
  cut(): this {
    return this.feed(3).raw(GS, 0x56, 66, 0); // GS V 66 0
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
