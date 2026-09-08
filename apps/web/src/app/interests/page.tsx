import Link from "next/link";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, interests as interestsTable } from "@callme/db";
import { brand } from "@callme/ui/brand";
import { Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { breadcrumbSchema, jsonLdScript, pageMeta } from "@/lib/seo";

export const revalidate = 86_400;

export const metadata: Metadata = pageMeta({
  title: "Browse interests",
  description: `Find people who share what you're into — music, gaming, language exchange, study, and more. Free random video chat, no signup, ${brand.minimumAge}+.`,
  path: "/interests",
});

const CATEGORY_LABELS: Record<string, string> = {
  creative: "Creative",
  learning: "Learning & language",
  gaming: "Gaming",
  lifestyle: "Lifestyle",
  social: "Just talking",
};

export default async function InterestsIndex() {
  const rows = await getDb()
    .select({
      id: interestsTable.id,
      label: interestsTable.label,
      category: interestsTable.category,
      emoji: interestsTable.emoji,
      blurb: interestsTable.blurb,
    })
    .from(interestsTable)
    .where(eq(interestsTable.isActive, true))
    .orderBy(asc(interestsTable.sortOrder));

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Interests", path: "/interests" },
          ]),
        )}
      />

      <SiteHeader />

      <main id="main" className="container-page py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What are you into?
        </h1>
        <p className="mt-4 max-w-xl text-[var(--text-muted)]">
          Pick a few when you start a chat and we&rsquo;ll try to match you with
          someone who shares them.
        </p>

        <div className="mt-12 space-y-12">
          {Object.entries(grouped).map(([category, list]) => (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <h2
                id={`cat-${category}`}
                className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]"
              >
                {CATEGORY_LABELS[category] ?? category}
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((i) => (
                  <Link key={i.id} href={`/interests/${i.id}`}>
                    <Card interactive className="h-full">
                      <CardBody className="p-4 pt-4">
                        <p className="flex items-center gap-2 font-medium">
                          {i.emoji ? <span aria-hidden>{i.emoji}</span> : null}
                          {i.label}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                          {i.blurb}
                        </p>
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
