import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface AppState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
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
    }),
    {
      name: "app-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
