import "react-i18next";
import type en from "@/locales/en.json";

// Type the translation key namespace from the English resource so `t("...")`
// keys are autocompleted and checked at build time. en.json is the source of
// truth; fr.json / ar.json are expected to mirror its shape.
declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
