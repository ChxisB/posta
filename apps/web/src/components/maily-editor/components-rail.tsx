"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { EDITOR_BLOCK_GROUPS, EDITOR_BLOCKS, type EditorBlock, filterBlocks } from "./blocks";
import { insertBlockAfterSelection, type TiptapEditor } from "./commands";
import { BLOCK_ICONS, SearchIcon } from "./icons";

/**
 * The components rail: every block the `/` menu offers, grouped, searchable
 * and one click (or Enter) from the email. A block goes after the block the
 * cursor is in, or at the end if the person has not clicked into the email
 * yet. `editor` is null while the block editor is not showing (the Preview,
 * HTML and Text views), and the blocks wait, disabled, until it is back.
 */
export function ComponentsRail({
  editor,
  defaultQuery = "",
}: {
  editor: TiptapEditor | null;
  /** Starts with this search (a static render has no typing). */
  defaultQuery?: string;
}) {
  const t = useTranslations("block-editor");
  const [query, setQuery] = useState(defaultQuery);
  const [added, setAdded] = useState("");
  // Whether the person has put a cursor in this editor: a fresh editor's
  // selection sits at the top, which is not somewhere they chose. Focus alone
  // is not enough (a window that is not in front never reports it), so a moved
  // selection counts too.
  const touched = useRef(false);
  useEffect(() => {
    touched.current = editor?.isFocused ?? false;
    if (!editor) return;
    const onTouch = () => {
      touched.current = true;
    };
    editor.on("focus", onTouch);
    editor.on("selectionUpdate", onTouch);
    return () => {
      editor.off("focus", onTouch);
      editor.off("selectionUpdate", onTouch);
    };
  }, [editor]);

  const labelOf = (key: EditorBlock["key"]) => ({
    title: t(`slash.${key}.title`),
    desc: t(`slash.${key}.desc`),
  });
  const shown = filterBlocks(EDITOR_BLOCKS, query, labelOf);

  function insert(entry: EditorBlock) {
    if (!editor) return;
    if (insertBlockAfterSelection(editor, entry.block, { atEnd: !touched.current })) {
      touched.current = true;
      setAdded(t("rail.added", { block: labelOf(entry.key).title }));
    }
  }

  return (
    <section className="po-blocks" aria-labelledby="po-blocks-title">
      <h2 id="po-blocks-title" className="po-blocks-title">
        {t("rail.label")}
      </h2>
      <div className="po-blocks-search">
        <SearchIcon size={14} />
        <input
          type="search"
          aria-label={t("rail.search")}
          placeholder={t("rail.search")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAdded("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              insert(shown[0]);
            }
          }}
        />
      </div>
      {shown.length === 0 ? (
        <p className="po-blocks-none">{t("rail.none", { query: query.trim() })}</p>
      ) : (
        EDITOR_BLOCK_GROUPS.map((group) => {
          const entries = shown.filter((entry) => entry.group === group);
          if (entries.length === 0) return null;
          return (
            <div key={group} className="po-blocks-group">
              <h3 className="po-blocks-group-title">{t(`rail.group.${group}`)}</h3>
              <ul className="po-blocks-list">
                {entries.map((entry) => {
                  const Icon = BLOCK_ICONS[entry.key];
                  const { title, desc } = labelOf(entry.key);
                  return (
                    <li key={entry.key}>
                      <button
                        type="button"
                        className="po-blocks-item"
                        disabled={!editor}
                        aria-label={t("rail.add", { block: title })}
                        title={desc}
                        // Keep the cursor where it is, so the block lands after it.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(entry)}
                      >
                        <span className="po-blocks-icon">
                          <Icon size={16} />
                        </span>
                        <span>{title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
      <p className="po-blocks-hint">{editor ? t("rail.hint") : t("rail.needsEdit")}</p>
      <p className="po-blocks-live" role="status">
        {added}
      </p>
    </section>
  );
}
