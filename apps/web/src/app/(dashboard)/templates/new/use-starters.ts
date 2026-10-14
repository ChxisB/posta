"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { buildStarter, STARTERS, type StarterTemplate } from "@/lib/starter-templates";

/** Every starter, written in the UI language. */
export function useStarters(): StarterTemplate[] {
  const text = useTranslations("templates.starters");
  const field = useTranslations("merge-fields");
  return useMemo(() => {
    const copy = { text: (key: string) => text(key), fieldLabel: (key: string) => field(key) };
    return STARTERS.map((spec) => buildStarter(spec, copy));
  }, [text, field]);
}
