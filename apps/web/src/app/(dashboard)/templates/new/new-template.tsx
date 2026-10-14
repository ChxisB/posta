"use client";

import { BLANK_STARTER } from "@/lib/starter-templates";
import { TemplateEditor } from "../editor";
import { StarterPicker } from "./starter-picker";
import { useStarters } from "./use-starters";

/**
 * "New template": the starting points, until one is chosen, then the editor
 * begun from it. `starter` is the choice, from the address, so Back from the
 * editor returns to the choices. `blank` is the editor as it was before
 * starters; an address that names none that exist shows the choices again.
 */
export function NewTemplate({ starter }: { starter: string | undefined }) {
  const starters = useStarters();
  if (starter === BLANK_STARTER) return <TemplateEditor key={BLANK_STARTER} />;
  const chosen = starters.find((candidate) => candidate.id === starter);
  if (chosen) {
    const { id, name, subject, previewText, document } = chosen;
    return <TemplateEditor key={id} seed={{ name, subject, previewText, document }} />;
  }
  return <StarterPicker starters={starters} />;
}
