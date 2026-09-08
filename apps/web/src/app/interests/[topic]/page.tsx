import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, interests as interestsTable } from "@callme/db";
import { brand } from "@callme/ui/brand";
import { Button, Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { breadcrumbSchema, faqSchema, jsonLdScript, pageMeta } from "@/lib/seo";

/**
 * The interest taxonomy lives in the database because it drives two things at
 * once: which queue partition a user joins, and which pages exist here. Reading
 * both from one table is what stops the matchmaker and the sitemap from
 * drifting apart as interests are added or retired.
 */
export async function generateStaticParams() {
  const rows = await getDb()
    .select({ id: interestsTable.id })
    .from(interestsTable)
    .where(eq(interestsTable.isActive, true));
  return rows.map((r) => ({ topic: r.id }));
}

export const dynamicParams = false;
export const revalidate = 86_400;

type Props = { params: Promise<{ topic: string }> };

async function loadInterest(id: string) {
  const rows = await getDb()
    .select()
    .from(interestsTable)
    .where(eq(interestsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic } = await params;
  const interest = await loadInterest(topic);
  if (!interest) return {};

  return pageMeta({
    title: `${interest.label} chat — talk to people who are into ${interest.label.toLowerCase()}`,
    description: `${interest.blurb ?? `Meet people who are into ${interest.label.toLowerCase()}.`} Free random video chat, no signup, ${brand.minimumAge}+.`,
    path: `/interests/${topic}`,
  });
}

export default async function InterestPage({ params }: Props) {
  const { topic } = await params;
  const interest = await loadInterest(topic);
  if (!interest) notFound();

  const related = await getDb()
    .select({
      id: interestsTable.id,
      label: interestsTable.label,
      emoji: interestsTable.emoji,
    })
    .from(interestsTable)
    .where(eq(interestsTable.category, interest.category))
    .orderBy(asc(interestsTable.sortOrder))
    .limit(9);

  const lower = interest.label.toLowerCase();
  const faqs = [
    {
      q: `How do I find people who like ${lower}?`,
      a: `Select "${interest.label}" on the chat screen before you start. We'll look for someone who picked it too, and widen the search after a few seconds if nobody's around.`,
    },
    {
      q: `What if nobody else has picked ${lower}?`,
      a: `The matchmaker relaxes automatically — first to anyone speaking your language, then to anyone at all. You never wait indefinitely on a niche interest.`,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(faqSchema(faqs))}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Interests", path: "/interests" },
            { name: interest.label, path: `/interests/${topic}` },
          ]),
        )}
      />

      <SiteHeader />

      <main id="main">
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="container-page relative py-16 sm:py-24">
            <nav aria-label="Breadcrumb" className="mb-5 text-sm text-[var(--text-subtle)]">
              <Link href="/" className="hover:text-[var(--text)]">Home</Link>
              <span className="mx-2">/</span>
              <Link href="/interests" className="hover:text-[var(--text)]">Interests</Link>
              <span className="mx-2">/</span>
              <span className="text-[var(--text-muted)]">{interest.label}</span>
            </nav>

            {interest.emoji ? (
              <span className="text-4xl" aria-hidden>
                {interest.emoji}
              </span>
            ) : null}

            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {interest.label} chat
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
              {interest.blurb}
            </p>

            <Button asChild size="lg" className="mt-8 px-8">
              <Link href="/chat">Start chatting</Link>
            </Button>
          </div>
        </section>

        <section className="container-page">
          <div className="prose-content">
            <h2>Why interest matching works</h2>
            <p>
              Random chat has a well-known failure mode: two people who have
              nothing in common stare at each other for four seconds and skip.
              Matching on a shared interest gives the conversation somewhere to
              start, and the difference in how long calls last is dramatic.
            </p>
            <p>
              But a strict filter creates the opposite problem. If you are the
              only person online who picked {lower}, a system that insists on an
              exact match leaves you waiting forever. Ours starts strict and
              widens — interest first, then language, then anyone — so you get
              the good match when it exists and a conversation regardless.
            </p>

            <h2>Questions</h2>
            {faqs.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container-page py-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            Related interests
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {related
              .filter((r) => r.id !== interest.id)
              .map((r) => (
                <Link key={r.id} href={`/interests/${r.id}`}>
                  <Card interactive>
                    <CardBody className="flex items-center gap-2 p-3.5 pt-3.5 text-sm font-medium">
                      {r.emoji ? <span aria-hidden>{r.emoji}</span> : null}
                      {r.label}
                    </CardBody>
                  </Card>
                </Link>
              ))}
          </div>
          <Link
            href="/interests"
            className="mt-5 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
          >
            All interests
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
