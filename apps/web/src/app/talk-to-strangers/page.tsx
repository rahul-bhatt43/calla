import Link from "next/link";
import type { Metadata } from "next";
import { brand } from "@callme/ui/brand";
import { Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { COUNTRIES } from "@/lib/countries";
import { breadcrumbSchema, jsonLdScript, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Talk to strangers by country",
  description: `Random video chat with people around the world. Browse ${COUNTRIES.length} countries and start talking in seconds — free, no signup, ${brand.minimumAge}+.`,
  path: "/talk-to-strangers",
});

/**
 * A hub page, not decoration. It gives every country page an internal link from
 * one crawl hop off the homepage, which is what keeps a large generated set
 * discoverable instead of orphaned in the sitemap.
 */
export default function CountriesIndex() {
  const grouped = COUNTRIES.reduce<Record<string, typeof COUNTRIES>>(
    (acc, c) => {
      const key = c.langName;
      (acc[key] ??= []).push(c);
      return acc;
    },
    {},
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Countries", path: "/talk-to-strangers" },
          ]),
        )}
      />

      <SiteHeader />

      <main id="main" className="container-page py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Talk to strangers, anywhere
        </h1>
        <p className="mt-4 max-w-xl text-[var(--text-muted)]">
          Pick a country to see when people there are most active, or just{" "}
          <Link href="/chat" className="text-[var(--accent)] underline underline-offset-4">
            start chatting
          </Link>{" "}
          and let the matchmaker sort it out.
        </p>

        <div className="mt-12 space-y-10">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([lang, list]) => (
              <section key={lang} aria-labelledby={`lang-${lang}`}>
                <h2
                  id={`lang-${lang}`}
                  className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]"
                >
                  {lang}
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((c) => (
                    <Link key={c.slug} href={`/talk-to-strangers/${c.slug}`}>
                      <Card interactive>
                        <CardBody className="p-3.5 pt-3.5 text-sm font-medium">
                          {c.name.replace(/^the /, "")}
                        </CardBody>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
