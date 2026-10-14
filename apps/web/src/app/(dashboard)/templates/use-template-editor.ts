"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MailyEditorChange } from "@/components/maily-editor";
import { authoredState, isMailyDoc } from "@/lib/email-doc";
import { buildMergeOptions } from "@/lib/merge-fields";
import { saveShortcut } from "@/lib/save-shortcut";
import { saveState } from "@/lib/save-state";
import { SAVED_FLASH_MS } from "@/lib/saved-flash";
import { stableStringify } from "@/lib/stable-json";
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
  /** The row's last save, shown until this session saves again. */
  updatedAt: Date | string;
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

  // Unsaved changes, for the leave warning and the header's save state. The
  // body's baseline is the last-persisted document as the block editor first
  // reads it (it fills in default attributes), compared regardless of key order
  // since jsonb reorders it; any later emit that differs marks the body dirty
  // until the next save. Code mode compares the html itself. Name and subject
  // compare with what was last saved.
  const [bodyDirty, setBodyDirty] = useState(false);
  const savedDoc = useRef<string | null>(
    initial !== undefined ? stableStringify(initial.document ?? null) : null,
  );
  // Until a restore or a convert, the editor's first reading is of the persisted body.
  const seedIsSaved = useRef(true);
  const savedHtml = useRef(initial?.html ?? "");
  const [savedMeta, setSavedMeta] = useState({
    name: initial?.name ?? "",
    subject: initial?.subject ?? "",
  });
  const dirty = bodyDirty || name !== savedMeta.name || subject !== savedMeta.subject;
  useUnsavedChangesWarning(dirty, common("unsavedWarn"));
  const [savedAt, setSavedAt] = useState<number | null>(() =>
    initial ? new Date(initial.updatedAt).getTime() : null,
  );

  // Local crash-recovery draft (browser-only, one key per template).
  const [editorNonce, setEditorNonce] = useState(0);
  const draftState = useMemo<TemplateDraft>(
    () => ({ name, subject, html, text, document }),
    [name, subject, html, text, document],
  );
  // The form as it is now, for a save that resolves after further edits.
  const live = useRef(draftState);
  live.current = draftState;
  const persisted: TemplateDraft = {
    name: initial?.name ?? "",
    subject: initial?.subject ?? "",
    html: initial?.html ?? "",
    text: initial?.text ?? "",
    document: initial?.document ?? null,
  };
  const draft = useLocalDraft<TemplateDraft>({
    storageKey: `po-draft:template:${initial?.id ?? "new"}`,
    state: draftState,
    initialState: persisted,
    compareAs: authoredState,
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
    seedIsSaved.current = false;
    setBodyDirty(true);
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
    const snapshot = stableStringify(v.document);
    if (v.seeded && seedIsSaved.current) {
      // The editor's reading of the persisted body (or a new one's empty body).
      savedDoc.current = snapshot;
      draft.rebase({ ...persisted, document: v.document });
    } else if (snapshot !== savedDoc.current) setBodyDirty(true);
    // A later mount (the preview tab unmounts it) reads the body as edited.
    seedIsSaved.current = false;
  }

  /** A source edit in code mode: dirty while it differs from the saved html. */
  function changeCode(next: string) {
    setHtml(next);
    setBodyDirty(next !== savedHtml.current);
  }

  const createMutation = useMutation(trpc.templates.create.mutationOptions());
  const updateMutation = useMutation(trpc.templates.update.mutationOptions());

  const complete = name.trim() !== "" && html.trim() !== "";
  const saving = createMutation.isPending || updateMutation.isPending;
  // On an existing template the create mutation only ever makes the converted copy.
  const saveFailed = updateMutation.isError || (createMutation.isError && !initial);
  const errorText = createMutation.isError && initial ? t("html.copyError") : null;
  // A new block body has no html until its first server render returns, and
  // Save waits for it.
  const preparing =
    mode === "blocks" && html.trim() === "" && (debouncedDoc !== document || rendered.isFetching);

  /** Create-or-update; returns the template id. */
  async function persist(): Promise<string> {
    const sent: TemplateDraft = { name, subject, html, text, document };
    const fields = templateSaveInput(mode, sent);
    let id: string;
    if (initial) {
      await updateMutation.mutateAsync({ id: initial.id, ...fields });
      id = initial.id;
    } else {
      ({ id } = await createMutation.mutateAsync(fields));
    }
    // What was sent is the new baseline. Edits made while the save was in
    // flight differ from it, so they stay unsaved (and in the local draft).
    const sentDoc = stableStringify(fields.document);
    savedDoc.current = sentDoc;
    savedHtml.current = sent.html;
    setSavedMeta({ name: sent.name, subject: sent.subject });
    setBodyDirty(
      mode === "code"
        ? live.current.html !== sent.html
        : stableStringify(live.current.document) !== sentDoc,
    );
    setSavedAt(Date.now());
    draft.markSaved(sent);
    return id;
  }

  // A fresh save is highlighted in the header for a moment; the timeout below ends it.
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
  // An open dialog (the convert dialog) owns ⌘↵ as its confirm. The block
  // editor hands ⌘↵ on to here rather than inserting a line break. Capture
  // phase: the open dialog is read before its own handler closes it (React
  // commits that before a later bubble listener runs).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dialogOpen = window.document.querySelector('[aria-modal="true"]') !== null;
      const action = saveShortcut(event, dialogOpen);
      if (action === null) return;
      event.preventDefault();
      if (action === "save") void save(false);
      else if (action === "saveAndClose") void save(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Html→blocks conversion. Both paths run Tiptap's parse inside the block
  // editor itself (MailyEditor convertHtml); the duplicate path does it in a
  // hidden mount so the original's page never shows a converted body.
  const [probeHtml, setProbeHtml] = useState<string | null>(null);
  const probeFired = useRef(false);
  const openConvert = () => setConvertOpen(true);
  const closeConvert = useCallback(() => setConvertOpen(false), []);
  const convertInPlace = useCallback(() => {
    // The editor's first reading is then a conversion, which is an edit.
    seedIsSaved.current = false;
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
    saveState: saveState({ saving, failed: saveFailed, dirty, preparing, savedAt }),
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
