"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { ModalFooter } from "@/components/modal-footer";
import { Select } from "@/components/select";
import { Skeleton } from "@/components/skeleton";
import { BtnSpinner } from "@/components/spinner";
import { formatDateTime } from "@/lib/format";
import { tagNameProblem } from "@/lib/template-tags";
import { useTRPC } from "@/lib/trpc";
import { guardMessage } from "@/lib/trpc-error";

const TAG_FIELD_ID = "tpl-tag-name";
const TAG_VERSION_ID = "tpl-tag-version";
const TAG_HINT_ID = "tpl-tag-hint";

/**
 * A template's published versions and its tags. Versions are frozen when the
 * template is published; a tag is a name that points at one of them, so a send
 * can ask for "production" and the version behind it can change without the
 * sender changing.
 */
export function VersionsDialog({
  open,
  onClose,
  templateId,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  /** Puts a version's content in the editor, unsaved. */
  onLoad: (version: number) => Promise<void>;
}) {
  const t = useTranslations("templates.versions");
  const common = useTranslations("common");
  const locale = useLocale();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const versions = useQuery(
    trpc.templates.versions.queryOptions({ id: templateId }, { enabled: open }),
  );
  const items = versions.data ?? [];

  const [tagName, setTagName] = useState("");
  const [tagVersion, setTagVersion] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries(trpc.templates.pathFilter());
  const fail = (error: unknown) => setFailure(guardMessage(error, t("error")));

  const setTag = useMutation(
    trpc.templates.setTag.mutationOptions({
      onSuccess: () => {
        setTagName("");
        setFailure(null);
        void refresh();
      },
      onError: fail,
    }),
  );
  const removeTag = useMutation(
    trpc.templates.removeTag.mutationOptions({
      onSuccess: () => {
        setFailure(null);
        void refresh();
      },
      onError: fail,
    }),
  );
  const deleteVersion = useMutation(
    trpc.templates.deleteVersion.mutationOptions({
      onSuccess: () => {
        setConfirming(null);
        setFailure(null);
        void refresh();
      },
      onError: (error) => {
        setConfirming(null);
        fail(error);
      },
    }),
  );

  const newest = items[0]?.version;
  // The version a new tag points at: the one chosen, else the newest.
  const target =
    tagVersion !== null && items.some((row) => String(row.version) === tagVersion)
      ? tagVersion
      : newest !== undefined
        ? String(newest)
        : "";
  const name = tagName.trim();
  const problem = name === "" ? null : tagNameProblem(name);
  const canTag = name !== "" && problem === null && target !== "" && !setTag.isPending;

  function submitTag() {
    if (!canTag) return;
    setTag.mutate({ id: templateId, name, version: Number(target) });
  }

  function load(version: number) {
    // The dialog steps aside first: a confirm over it would share its Esc.
    onClose();
    void onLoad(version);
  }

  return (
    <Modal open={open} onClose={onClose} size="wide" title={t("title")}>
      <p style={{ margin: "0 0 16px", color: "var(--po-muted)", fontSize: "var(--po-fs-ui)" }}>
        {t("intro")}
      </p>

      {versions.isPending ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton width="100%" height={44} radius="var(--po-r-input)" />
          <Skeleton width="100%" height={44} radius="var(--po-r-input)" />
        </div>
      ) : versions.isError ? (
        <p className="po-field-error" role="alert" style={{ margin: 0 }}>
          {t("loadError")}{" "}
          <button
            type="button"
            className="po-btn po-btn-ghost po-btn-sm"
            onClick={() => versions.refetch()}
          >
            {t("retry")}
          </button>
        </p>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, color: "var(--po-muted)", fontSize: "var(--po-fs-ui)" }}>
          {t("empty")}
        </p>
      ) : (
        <ul
          aria-label={t("listLabel")}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: "50vh",
            overflowY: "auto",
          }}
        >
          {items.map((row) => (
            <li
              key={row.version}
              className="po-card"
              style={{
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "var(--po-fs-ui)" }}>
                    {t("version", { version: row.version })}
                  </strong>
                  {row.version === newest ? <span className="po-chip">{t("newest")}</span> : null}
                  {row.tags.map((tag) => (
                    <span key={tag} className="po-chip">
                      {tag}
                      <button
                        type="button"
                        aria-label={t("removeTag", { name: tag })}
                        disabled={removeTag.isPending}
                        onClick={() => removeTag.mutate({ id: templateId, name: tag })}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    color: "var(--po-muted)",
                    fontSize: "var(--po-fs-label)",
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateTime(new Date(row.createdAt), locale)}
                  {" · "}
                  {row.subject ? row.subject : t("noSubject")}
                </div>
              </div>
              {confirming === row.version ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "var(--po-fs-label)", color: "var(--po-muted)" }}>
                    {t("deleteAsk", { version: row.version })}
                  </span>
                  <button
                    type="button"
                    className="po-btn po-btn-secondary po-btn-sm"
                    onClick={() => setConfirming(null)}
                  >
                    {common("cancel")}
                  </button>
                  <button
                    type="button"
                    className="po-btn po-btn-destructive po-btn-sm"
                    disabled={deleteVersion.isPending}
                    onClick={() => deleteVersion.mutate({ id: templateId, version: row.version })}
                  >
                    <BtnSpinner on={deleteVersion.isPending} />
                    {t("deleteConfirm")}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="po-btn po-btn-secondary po-btn-sm"
                    onClick={() => load(row.version)}
                  >
                    {t("load")}
                  </button>
                  <button
                    type="button"
                    className="po-btn po-btn-ghost po-btn-sm"
                    disabled={row.tags.length > 0}
                    title={row.tags.length > 0 ? t("deleteTagged") : undefined}
                    onClick={() => setConfirming(row.version)}
                  >
                    {t("delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {failure ? (
        <p className="po-field-error" role="alert" style={{ margin: "12px 0 0" }}>
          {failure}
        </p>
      ) : null}

      {items.length > 0 ? (
        <form
          style={{ marginTop: 18 }}
          onSubmit={(event) => {
            event.preventDefault();
            submitTag();
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="po-field" style={{ flex: "1 1 200px", margin: 0 }}>
              <label htmlFor={TAG_FIELD_ID}>{t("tagName")}</label>
              <input
                id={TAG_FIELD_ID}
                className="po-input mono"
                style={{ width: "100%" }}
                placeholder={t("tagPlaceholder")}
                value={tagName}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={TAG_HINT_ID}
                aria-invalid={problem !== null || undefined}
                onChange={(event) => setTagName(event.target.value)}
              />
            </div>
            <div className="po-field" style={{ margin: 0 }}>
              <label htmlFor={TAG_VERSION_ID}>{t("tagVersion")}</label>
              <Select
                id={TAG_VERSION_ID}
                ariaLabel={t("tagVersion")}
                width={140}
                value={target}
                onChange={setTagVersion}
                options={items.map((row) => ({
                  value: String(row.version),
                  label: t("version", { version: row.version }),
                }))}
              />
            </div>
            <button type="submit" className="po-btn po-btn-secondary" disabled={!canTag}>
              <BtnSpinner on={setTag.isPending} />
              {t("tagSet")}
            </button>
          </div>
          <p
            id={TAG_HINT_ID}
            className={problem ? "po-field-error" : undefined}
            style={{
              margin: "8px 0 0",
              fontSize: "var(--po-fs-label)",
              color: problem ? undefined : "var(--po-muted)",
            }}
          >
            {problem === "format"
              ? t("tagInvalid")
              : problem === "digits"
                ? t("tagDigits")
                : t("tagHint")}
          </p>
        </form>
      ) : null}

      <ModalFooter>
        <button type="button" className="po-btn po-btn-secondary" onClick={onClose}>
          {common("close")} <span className="po-keycap">Esc</span>
        </button>
      </ModalFooter>
    </Modal>
  );
}
