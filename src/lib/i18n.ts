import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { enUS, fr as frLocale, arDZ } from "date-fns/locale";
import type { Locale } from "date-fns";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import ar from "@/locales/ar.json";

/** Languages the app ships with. Order is used by the language switcher. */
export const SUPPORTED_LANGUAGES = ["en", "fr", "ar"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Right-to-left languages. Everything else is treated as LTR. */
const RTL_LANGUAGES: readonly Language[] = ["ar"];

export function isRtl(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}

export function dirFor(lang: Language): "rtl" | "ltr" {
  return isRtl(lang) ? "rtl" : "ltr";
}

/** Native display names, used in the language switcher. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

// Synchronous init: resources are bundled, so the first render already has them.
// `lng` is bootstrapped to the persisted preference by LanguageProvider.
void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
  returnNull: false,
});

const DATE_LOCALES: Record<Language, Locale> = {
  en: enUS,
  fr: frLocale,
  ar: arDZ,
};

/** date-fns locale object for the given app language (for `format(..., { locale })`). */
export function dateFnsLocale(lang: Language): Locale {
  return DATE_LOCALES[lang] ?? enUS;
}

// BCP-47 tags for Intl/`toLocale*` APIs. Arabic forces Latin digits (`-u-nu-latn`)
// to stay consistent with the Western numerals used for prices.
const INTL_LOCALES: Record<Language, string> = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar-DZ-u-nu-latn",
};

/**
 * BCP-47 locale tag for `Date#toLocale*`/`Intl`, derived from the active
 * language. Pass the result as the `locales` argument so dates follow the UI
 * language even outside React (receipts, exports).
 */
export function intlLocale(lang?: Language): string {
  const l = lang ?? (i18n.language as Language);
  return INTL_LOCALES[l] ?? INTL_LOCALES.en;
}

export default i18n;
