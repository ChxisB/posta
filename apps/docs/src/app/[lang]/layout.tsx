import "@fontsource-variable/geist";
import "../global.css";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { i18nUI } from "@/lib/i18n-ui";
import { baseOptions } from "@/lib/layout.shared";
import { DOCS_ORIGIN } from "@/lib/site";
import { source } from "@/lib/source";

interface LayoutProps {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(DOCS_ORIGIN),
    icons: { icon: "/logo/posta-favicon.svg" },
    openGraph: { siteName: "Posta Docs", type: "website", images: "/og.png" },
    twitter: { card: "summary_large_image" },
    title: {
      template: "%s · Posta Docs",
      default: "Posta Docs",
    },
    description:
      "Documentation for Posta: the open-source, Resend-compatible email platform, available as a hosted service or self-hosted.",
  };
}

export default async function Layout({ params, children }: LayoutProps) {
  const { lang } = await params;
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider theme={{ defaultTheme: "dark" }} i18n={i18nUI.provider(lang)}>
          <DocsLayout tree={source.getPageTree(lang)} {...baseOptions()}>
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
