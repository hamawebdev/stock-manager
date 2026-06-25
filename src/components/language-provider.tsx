import { useEffect } from "react";
import { useAppStore } from "@/store/use-app-store";
import { DirectionProvider } from "@/components/ui/direction";
import i18n, { dirFor } from "@/lib/i18n";

/**
 * Applies the selected language to i18next and to the document root, and mirrors
 * the layout to RTL for Arabic. Wraps the tree in Radix's DirectionProvider so
 * menus/popovers/sliders/sheets flip automatically. Mirrors ThemeProvider.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useAppStore((s) => s.language);
  const dir = dirFor(language);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
    const root = document.documentElement;
    root.lang = language;
    root.dir = dir;
  }, [language, dir]);

  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
