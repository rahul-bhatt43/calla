import type { Metadata } from "next";
import { brand } from "@callme/ui/brand";

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? brand.url
).replace(/\/$/, "");

export const absolute = (path: string) =>
  `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  /** Suppresses indexing for app routes that have nothing to offer a crawler. */
  noIndex?: boolean;
  type?: "website" | "article";
  publishedAt?: string;
  /** Locale variants, used to emit hreflang alternates. */
  locales?: string[];
}

/**
 * Every indexable route builds its metadata here.
 *
 * Centralised for one reason: canonical URLs and hreflang are the two things
 * that quietly ruin a programmatic-SEO site when each page rolls its own. A few
 * hundred generated pages with subtly inconsistent canonicals will get
 * consolidated by the crawler in ways nobody intended.
 */
export function pageMeta({
  title,
  description,
  path,
  noIndex,
  type = "website",
  publishedAt,
  locales,
}: PageMetaInput): Metadata {
  const url = absolute(path);
  const fullTitle = path === "/" ? title : `${title} · ${brand.name}`;

  return {
    title: fullTitle,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: url,
      languages: locales
        ? {
            ...Object.fromEntries(
              locales.map((l) => [l, absolute(`/${l}${path}`)]),
            ),
            "x-default": url,
          }
        : undefined,
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large" },
        },
    openGraph: {
      type,
      url,
      siteName: brand.name,
      title: fullTitle,
      description,
      publishedTime: publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      site: brand.twitter,
      title: fullTitle,
      description,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Structured data                                                             */
/* -------------------------------------------------------------------------- */

/**
 * JSON-LD is rendered as a plain <script> rather than through a helper library.
 * The `<` escape below is not decorative: any string interpolated into a JSON-LD
 * block that contains `</script>` would otherwise close the tag early and turn
 * page copy into executable markup.
 */
export function jsonLdScript(data: object): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export const websiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: brand.name,
  url: siteUrl,
  description: brand.description,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/interests/{search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
});

export const organizationSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: brand.legalName,
  url: siteUrl,
  email: brand.supportEmail,
  sameAs: [`https://twitter.com/${brand.twitter.replace("@", "")}`],
});

export const appSchema = () => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: brand.name,
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Any (web browser)",
  description: brand.description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
});

export const faqSchema = (faqs: Array<{ q: string; a: string }>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

export const breadcrumbSchema = (
  crumbs: Array<{ name: string; path: string }>,
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: crumbs.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.name,
    item: absolute(c.path),
  })),
});
