"use client";

import { useTranslations } from "next-intl";
import styles from "./auth.module.css";
import { SilkCanvas } from "./silk-canvas";

/** Same screen chrome as AuthForm, for the recovery and OAuth consent screens. */
export function AuthScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const tCommon = useTranslations("common");
  return (
    <main className={styles.screen}>
      {/* biome-ignore lint/performance/noImgElement: decorative full-bleed backdrop, no optimization needed */}
      <img src="/auth/waves-dark.webp" alt="" className={`po-dark-only ${styles.backdrop}`} />
      {/* biome-ignore lint/performance/noImgElement: decorative full-bleed backdrop, no optimization needed */}
      <img src="/auth/waves-light.webp" alt="" className={`po-light-only ${styles.backdrop}`} />
      <SilkCanvas />
      <div className={styles.column}>
        {/* biome-ignore lint/performance/noImgElement: static SVG logo, nothing for next/image to optimize */}
        <img
          src="/logo/posta-wordmark.svg"
          className="po-wordmark"
          alt={tCommon("appName")}
          height={32}
        />
        <h1 className={`po-display ${styles.headline}`}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
