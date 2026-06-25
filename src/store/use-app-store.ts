import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Language } from "@/lib/i18n";

type Theme = "light" | "dark" | "system";

interface AppState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (language: Language) => void;
}

/**
 * Global UI state, persisted to localStorage. Swap the storage for
 * `@tauri-apps/plugin-store` if you need it persisted outside the webview.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      language: "en",
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "app-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
