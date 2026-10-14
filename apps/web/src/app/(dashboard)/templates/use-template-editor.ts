"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MailyEditorChange } from "@/components/maily-editor";
import { isMailyDoc } from "@/lib/email-doc";
import { buildMergeOptions } from "@/lib/merge-fields";
import { SAVED_FLASH_MS } from "@/lib/saved-flash";
import {
  type BodyTab,
  blocksCopyName,
  bodyEditorMode,
  firstBodyTab,
  templateSaveInput,
} from "@/lib/template-mode";
import { useTRPC } from "@/lib/trpc";
import { useLocalDraft } from "@/lib/use-local-draft";
import { confirmUnsavedNavigation, useUnsavedChangesWarning } from "@/lib/use-unsaved-warning";

/** Everything a crash would lose — mirrored into the local draft. */
interface TemplateDraft {
  name: string;
  subject: string;
  html: string;
  text: string;
  document: unknown;
}

export interface EditorInitial {
  id: string;
  name: string;
  subject: string | null;
  html: string;
  text: string | null;
  document: unknown;
}

/**
 * Everything the template editor holds and does: the fields, the body's mode
 * and tab, the unsaved-changes tracking and local draft, the server render,
 * saving (and its keys), and the html→blocks conversion. TemplateEditor
 * composes its views from what this returns.
 */
export function useTemplateEditor(initial: EditorInitial | undefined) {
  const t = useTranslations("templates");
  const common = useTranslations("common");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [html, setHtml] = useState(initial?.html ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [document, setDocument] = useState<unknown>(initial?.document ?? null);
  // Armed by "Convert this template": the block editor then mounts on the
  // html seed and emits its parse. Until then a document-less row never
  // reaches the block editor — its html would be flattened on the first edit.
  const [converting, setConverting] = useState(false);
  const mode = bodyEditorMode({ document, html, converting });
  // Html-authored rows open on their faithful preview, not on an editor.
  const [tab, setTab] = useState<BodyTab>(() => firstBodyTab(initial));
  const [convertOpen, setConvertOpen] = useState(false);

  // Unsaved-body tracking for the native leave warning: the baseline is the
  // last-persisted document (or the editor's very first emit for a new one);
  // any later emit that differs arms beforeunload until the next save. Code
  // mode compares the html itself.
  const [dirty, setDirty] = useState(false);
  const savedDoc = useRef<string | null>(
    initial !== undefined ? JSON.stringify(initial.document ?? null) : null,
  );
  const savedHtml = useRef(initial?.html ?? "");
  useUnsavedChangesWarning(dirty, common("unsavedWarn"));

  // Local crash-recovery draft (browser-only, one key per template).
  const [editorNonce, setEditorNonce] = useState(0);
  const draftState = useMemo<TemplateDraft>(
    () => ({ name, subject, html, text, document }),
    [name, subject, html, text, document],
  );
  const draft = useLocalDraft<TemplateDraft>({
    storageKey: `po-draft:template:${initial?.id ?? "new"}`,
    state: draftState,
    initialState: {
      name: initial?.name ?? "",
      subject: initial?.subject ?? "",
      html: initial?.html ?? "",
      text: initial?.text ?? "",
      document: initial?.document ?? null,
    },
  });

  function restoreDraft(data: TemplateDraft) {
    setName(data.name);
    setSubject(data.subject);
    setHtml(data.html);
    setText(data.text);
    setDocument(data.document);
    // The editor seeds once from its mount value — remount it.
    setEditorNonce((n) => n + 1);
    // A restored draft is unsaved by definition: poison the baseline so the
    // editor's next emit differs and the leave-guard arms immediately.
    savedDoc.current = "__restored__";
    setDirty(true);
    draft.acceptRecovered();
  }

  function restoreRecovered() {
    const r = draft.recovered;
    if (r) restoreDraft(r.data);
  }

  // Merge-field picker options and preview sample values both derive from the
  // team's contact-property keys in use, plus its typed definitions so a
  // defined key is insertable before any contact carries a value.
  const properties = useQuery(trpc.audience.properties.list.queryOptions());
  const definedProps = useQuery(trpc.audience.properties.defineList.queryOptions());
  const mergeFields = useMemo(
    () =>
      buildMergeOptions([
        ...(properties.data ?? []).map((p) => p.key),
        ...(definedProps.data ?? []).map((p) => p.key),
      ]),
    [properties.data, definedProps.data],
  );
  const previewSamples = useMemo(
    () => Object.fromEntries((properties.data ?? []).map((p) => [p.key, p.sampleValue])),
    [properties.data],
  );

  // Send html is rendered server-side (Maily needs juice), so a design-mode
  // edit cannot emit it — this debounced render both feeds the preview and
  // supplies the html we persist. Code mode never renders: its html is the
  // source itself.
  const [debouncedDoc, setDebouncedDoc] = useState<unknown>(document);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedDoc(document), 350);
    return () => clearTimeout(id);
  }, [document]);
  const rendered = useQuery(
    trpc.email.render.queryOptions(
      { document: debouncedDoc },
      { enabled: isMailyDoc(debouncedDoc) },
    ),
  );
  useEffect(() => {
    if (!rendered.data) return;
    setHtml(rendered.data.html);
    setText(rendered.data.text);
  }, [rendered.data]);

  /** The block editor's emit: a new document, dirty once it differs from the baseline. */
  function changeBlocks(v: MailyEditorChange) {
    setDocument(v.document);
    const snapshot = JSON.stringify(v.document);
    // First emit of a brand-new document is the baseline, not an edit.
    if (savedDoc.current === null) savedDoc.current = snapshot;
    else if (snapshot !== savedDoc.current) setDirty(true);
  }

  /** A source edit in code mode: dirty while it differs from the saved html. */
  function changeCode(next: string) {
    setHtml(next);
    setDirty(next !== savedHtml.current);
  }

  const createMutation = useMutation(trpc.templates.create.mutationOptions());
  const updateMutation = useMutation(trpc.templates.update.mutationOptions());

  const complete = name.trim() !== "" && html.trim() !== "";
  const saving = createMutation.isPending || updateMutation.isPending;
  // On an existing template the create mutation only ever makes the converted copy.
  const errorText =
    updateMutation.isError || (createMutation.isError && !initial)
      ? t("editor.saveError")
      : createMutation.isError
        ? t("html.copyError")
        : null;

  /** Create-or-update; returns the template id. */
  async function persist(): Promise<string> {
    const fields = templateSaveInput(mode, { name, subject, html, text, document });
    let id: string;
    if (initial) {
      await updateMutation.mutateAsync({ id: initial.id, ...fields });
      id = initial.id;
    } else {
      ({ id } = await createMutation.mutateAsync(fields));
    }
    savedDoc.current = JSON.stringify(fields.document);
    savedHtml.current = html;
    setDirty(false);
    draft.markSaved();
    return id;
  }

  // Transient "✓ Saved" beside the Save button; the timeout below retires it.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    return () => clearTimeout(id);
  }, [justSaved]);

  async function save(close: boolean) {
    if (!complete || saving) return;
    try {
      const id = await persist();
      setJustSaved(true);
      queryClient.invalidateQueries(trpc.templates.pathFilter());
      if (close) router.push("/templates");
      else if (!initial) router.replace(`/templates/${id}/edit`);
    } catch {
      // Shown via the mutations' error state.
    }
  }

  // ⌘S saves, ⌘↵ saves and closes — matching the keycaps on the buttons.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "s") {
        event.preventDefault();
        void save(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        void save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Html→blocks conversion. Both paths run Tiptap's parse inside the block
  // editor itself (MailyEditor convertHtml); the duplicate path does it in a
  // hidden mount so the original's page never shows a converted body.
  const [probeHtml, setProbeHtml] = useState<string | null>(null);
  const probeFired = useRef(false);
  const openConvert = () => setConvertOpen(true);
  const closeConvert = useCallback(() => setConvertOpen(false), []);
  const convertInPlace = useCallback(() => {
    setConvertOpen(false);
    setConverting(true);
    setTab("edit");
  }, []);
  const duplicateAndConvert = useCallback(() => {
    // The copy carries the current html and we leave for it; unsaved edits
    // to the original would be lost, so the shared leave prompt applies.
    if (!confirmUnsavedNavigation()) return;
    setConvertOpen(false);
    probeFired.current = false;
    setProbeHtml(html);
  }, [html]);
  async function createConvertedCopy(doc: unknown) {
    setProbeHtml(null);
    try {
      const { id } = await createMutation.mutateAsync(
        templateSaveInput("blocks", {
          name: blocksCopyName(name),
          subject,
          html,
          text,
          document: doc,
        }),
      );
      queryClient.invalidateQueries(trpc.templates.pathFilter());
      router.push(`/templates/${id}/edit`);
    } catch {
      // Shown via the create mutation's error state.
    }
  }

  /** The probe's emit: its parse of the html becomes the copy, once. */
  function changeProbe(v: MailyEditorChange) {
    if (probeFired.current) return;
    probeFired.current = true;
    void createConvertedCopy(v.document);
  }

  const wideBody = mode === "code" && tab === "edit";

  return {
    editing: initial !== undefined,
    name,
    setName,
    subject,
    setSubject,
    html,
    text,
    document,
    mode,
    tab,
    setTab,
    wideBody,
    converting,
    editorNonce,
    mergeFields,
    previewSamples,
    changeBlocks,
    changeCode,
    recovered: draft.recovered,
    restoreRecovered,
    discardRecovered: draft.discardRecovered,
    complete,
    saving,
    justSaved,
    errorText,
    save,
    convertOpen,
    openConvert,
    closeConvert,
    convertInPlace,
    duplicateAndConvert,
    copying: createMutation.isPending,
    probeHtml,
    changeProbe,
  };
}
