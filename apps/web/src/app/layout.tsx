import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@callme/ui/brand";
import {
  jsonLdScript,
  organizationSchema,
  pageMeta,
  websiteSchema,
} from "@/lib/seo";
import "./globals.css";

// Self-hosted at build time by next/font: the font files are emitted into our
// own /_next/static output and no request ever reaches Google. That removes a
// third-party origin, a DNS lookup and a render-blocking round trip in one go.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  // Metric overrides for the fallback face so swapping fonts doesn't shift
  // layout — CLS is a ranking signal and this is the cheapest way to protect it.
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  ...pageMeta({
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.description,
    path: "/",
  }),
  applicationName: brand.name,
  authors: [{ name: brand.legalName }],
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available; disabling it is an accessibility failure and the
  // in-call layout is designed to tolerate it.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#191a21" },
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
  ],
};

/**
 * Applies the saved theme before first paint.
 *
 * Runs blocking and inline on purpose: any later and a dark-mode user gets a
 * white flash while React hydrates, which on a product people open at night is
 * genuinely unpleasant. It is a handful of bytes and cannot be deferred.
 */
const themeScript = `
(function(){try{var t=localStorage.getItem('callme-theme');
if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(websiteSchema())}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(organizationSchema())}
        />
      </head>
      <body className="min-h-dvh bg-[var(--bg)] text-[var(--text)] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-[var(--radius-md)] focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-[var(--accent-fg)]"
        >
          Skip to content
        </a>
        {/* No global providers by design. Toast and tooltip contexts are only
            used inside the chat surface, and mounting them here would ship
            their client bundles with every statically rendered marketing page —
            paid for in Core Web Vitals on exactly the pages we want to rank.
            They are mounted in the chat route instead. */}
        {children}
      </body>
    </html>
  );
}
