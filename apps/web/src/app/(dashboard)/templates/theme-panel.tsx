"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import {
  EMAIL_COLOUR_KEYS,
  EMAIL_CORNERS,
  EMAIL_FONTS,
  EMAIL_SPACING,
  EMAIL_THEME_PRESETS,
  type EmailColourKey,
  type EmailTheme,
  effectiveTheme,
  normaliseHex,
  presetOf,
  themeContrastIssues,
  withField,
} from "@/lib/email-theme";
import { themeFieldId } from "./field-ids";

/**
 * One colour: the browser's picker beside a hex field. The hex field keeps what
 * is being typed until it leaves, and commits as soon as it reads as a colour,
 * so `#7046e8` is a colour only once it is whole, and a half-typed one is
 * never forced back under the person's cursor.
 */
function ColourRow({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (hex: string) => void;
}) {
  const t = useTranslations("templates.theme");
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && normaliseHex(draft) === null;
  const noteId = `${id}-note`;

  return (
    <div className="po-etheme-colour">
      <label htmlFor={id} className="po-etheme-colour-label">
        {label}
      </label>
      <div className="po-etheme-colour-controls">
        <input
          type="color"
          className="po-etheme-swatch"
          aria-label={t("picker", { colour: label })}
          value={value}
          onChange={(event) => onCommit(event.target.value.toLowerCase())}
        />
        <input
          id={id}
          className={invalid ? "po-input mono po-etheme-hex error" : "po-input mono po-etheme-hex"}
          value={shown}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? noteId : undefined}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const hex = normaliseHex(text);
            if (hex) onCommit(hex);
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      {invalid ? (
        <p id={noteId} className="po-etheme-colour-note">
          {t("hexInvalid")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The settings rail's "Email theme": the look of the email itself (its colours,
 * font, corners and the space around it), which is not the dashboard's. Every
 * change is a whole new theme handed up; the page puts it on the document.
 * Choosing something that equals the default look removes it from the document.
 */
export function ThemePanel({
  theme,
  onChange,
}: {
  theme: EmailTheme | undefined;
  onChange: (next: EmailTheme | undefined) => void;
}) {
  const t = useTranslations("templates.theme");
  const format = useFormatter();
  const uid = useId();
  const titleId = `${uid}-title`;
  const values = effectiveTheme(theme);
  const preset = presetOf(theme);
  const issues = themeContrastIssues(theme);

  const colourLabel = (key: EmailColourKey) => t(`colour.${key}`);
  // Rounded down, so a ratio just under the line never reads as the line.
  const ratio = (r: number) =>
    format.number(Math.floor(r * 10) / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <section className="po-etheme" aria-labelledby={titleId}>
      <h3 id={titleId} className="po-etheme-title">
        {t("title")}
      </h3>
      <p className="po-etheme-hint">{t("hint")}</p>

      <Segmented
        label={t("presets")}
        options={EMAIL_THEME_PRESETS.map((p) => ({
          value: p.id as string,
          label: t(`preset.${p.id}`),
        }))}
        value={preset ?? "custom"}
        onChange={(id) => onChange(EMAIL_THEME_PRESETS.find((p) => p.id === id)?.theme)}
      />

      <fieldset className="po-etheme-group">
        <legend className="po-etheme-legend">{t("colours")}</legend>
        {EMAIL_COLOUR_KEYS.map((key) => (
          <ColourRow
            key={key}
            id={themeFieldId(key)}
            label={colourLabel(key)}
            value={values[key]}
            onCommit={(hex) => onChange(withField(theme, key, hex))}
          />
        ))}
      </fieldset>

      {issues.length > 0 ? (
        <div className="po-etheme-issues">
          <p className="po-etheme-issues-title">{t("issues.title")}</p>
          <ul className="po-etheme-issue-list">
            {issues.map((issue) => (
              <li key={issue.pair}>{t(`issues.${issue.pair}`, { ratio: ratio(issue.ratio) })}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="po-field">
        <label htmlFor={`${uid}-font`}>{t("font")}</label>
        <Select
          id={`${uid}-font`}
          ariaLabel={t("font")}
          width="100%"
          value={values.font}
          options={EMAIL_FONTS.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(id) => {
            const font = EMAIL_FONTS.find((f) => f.id === id);
            if (font) onChange(withField(theme, "font", font.id));
          }}
        />
      </div>

      <div className="po-field">
        <span className="po-etheme-label">{t("corners")}</span>
        <Segmented
          label={t("corners")}
          options={EMAIL_CORNERS.map((c) => ({ value: c, label: t(`corner.${c}`) }))}
          value={values.corners}
          onChange={(corners) => onChange(withField(theme, "corners", corners))}
        />
      </div>

      <div className="po-field">
        <span className="po-etheme-label">{t("spacing")}</span>
        <Segmented
          label={t("spacing")}
          options={EMAIL_SPACING.map((s) => ({ value: s, label: t(`space.${s}`) }))}
          value={values.spacing}
          onChange={(spacing) => onChange(withField(theme, "spacing", spacing))}
        />
      </div>

      <button
        type="button"
        className="po-btn po-btn-ghost po-btn-sm po-etheme-reset"
        disabled={theme === undefined}
        onClick={() => onChange(undefined)}
      >
        {t("reset")}
      </button>
    </section>
  );
}
