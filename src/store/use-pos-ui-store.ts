import { create } from "zustand";

/**
 * UI-only coordination state for the POS keyboard-shortcut system. Kept out of
 * the cart store (which owns the sale domain) because this is purely about
 * which cart line is "focused" for keyboard editing, how the payment panel
 * exposes its submit action to the global hotkey handler, and whether the
 * shortcuts help overlay is open.
 */
interface PosUiState {
  /** Cart line (by variant id) currently selected for keyboard actions. */
  selectedLineId: number | null;
  setSelectedLineId: (id: number | null) => void;

  /**
   * The payment panel registers its primary settle action here (Charge in sell
   * mode, Refund in return mode) so the global F2 shortcut can trigger it from
   * anywhere on the page without prop-drilling through the layout.
   */
  submit: (() => void) | null;
  setSubmit: (fn: (() => void) | null) => void;

  /** Shortcuts cheat-sheet overlay. */
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export const usePosUiStore = create<PosUiState>((set) => ({
  selectedLineId: null,
  setSelectedLineId: (selectedLineId) => set({ selectedLineId }),

  submit: null,
  setSubmit: (submit) => set({ submit }),

  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));
