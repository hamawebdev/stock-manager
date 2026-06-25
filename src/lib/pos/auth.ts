/**
 * Manager-PIN gate. Sensitive POS actions (edit price, refund, open drawer,
 * pay-out, void) can require a manager PIN. This is a low-security gate for a
 * single trusted register — NOT authentication: there are no user accounts and
 * the hash lives in the local settings table. It only deters casual misuse.
 */
import { getSetting, setSetting } from "./settings";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PinConfig {
  required: boolean;
  /** Whether a PIN has actually been set (gate is meaningless without one). */
  isSet: boolean;
}

export async function getPinConfig(): Promise<PinConfig> {
  const required = (await getSetting("require_manager_pin")) === "1";
  const hash = (await getSetting("manager_pin_hash")) ?? "";
  return { required, isSet: hash.length > 0 };
}

/** Save a new PIN (stored hashed). Pass an empty string to clear it. */
export async function setManagerPin(pin: string): Promise<void> {
  const hash = pin.trim() ? await sha256Hex(pin.trim()) : "";
  await setSetting("manager_pin_hash", hash);
}

export async function setPinRequired(required: boolean): Promise<void> {
  await setSetting("require_manager_pin", required ? "1" : "0");
}

export async function verifyManagerPin(pin: string): Promise<boolean> {
  const stored = (await getSetting("manager_pin_hash")) ?? "";
  if (!stored) return true; // no PIN configured → gate is open
  return (await sha256Hex(pin.trim())) === stored;
}

/**
 * Whether the gate should challenge for `action`. True only when a PIN is
 * required AND actually set; otherwise sensitive actions pass through.
 */
export async function isGateActive(): Promise<boolean> {
  const { required, isSet } = await getPinConfig();
  return required && isSet;
}
