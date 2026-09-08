import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { brand } from "@callme/ui/brand";
import { Badge, Button, Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { COMPETITORS, getCompetitor } from "@/lib/competitors";
import { breadcrumbSchema, faqSchema, jsonLdScript, pageMeta } from "@/lib/seo";

/**
 * "<competitor> alternative" is the highest-intent query in this category:
 * whoever types it has already decided they want the product and is only
 * picking a provider.
 *
 * The copy is kept strictly factual about other services — publicly documented
 * facts only — and draws the contrast on what we do rather than on accusations.
 * That is both the honest way to write it and the durable one.
 */
export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export const dynamicParams = false;

type Props = { params: Promise<{ competitor: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor: slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) return {};

  return pageMeta({
    title: `${competitor.name} alternative`,
    description: `Looking for a ${competitor.name} alternative? ${brand.name} is free random video chat with interest matching, on-device explicit-content detection, and peer-to-peer messages that never touch a server.`,
    path: `/alternatives/${slug}`,
  });
}

export default async function AlternativePage({ params }: Props) {
  const { competitor: slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) notFound();

  const faqs = [
    {
      q: `Is ${brand.name} a good ${competitor.name} alternative?`,
      a: `${brand.name} covers the same use case — meeting and talking to new people at random — with interest-based matching, a text-only mode, and moderation built on persistent identities rather than IP addresses.`,
    },
    {
      q: `Is it free?`,
      a: `Yes, with no account required to start. Because video and messages travel directly between browsers rather than through our servers, it costs very little to operate.`,
    },
    {
      q: `Do I need to install an app?`,
      a: `No. It runs in any modern browser on desktop and mobile.`,
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
            { name: "Alternatives", path: `/alternatives/${slug}` },
          ]),
        )}
      />

      <SiteHeader />

      <main id="main">
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="container-page relative py-16 sm:py-24">
            <Badge tone={competitor.status === "shut down" ? "warning" : "neutral"}>
              {competitor.status === "shut down"
                ? `${competitor.name} is no longer running`
                : `Compared with ${competitor.name}`}
            </Badge>

            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              A {competitor.name} alternative that takes safety seriously
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              {competitor.summary}
            </p>

            <Button asChild size="lg" className="mt-8 px-8">
              <Link href="/chat">Try {brand.name} free</Link>
            </Button>
          </div>
        </section>

        <section className="container-page">
          <div className="prose-content">
            <h2>Why people are looking</h2>
            <p>{competitor.context}</p>
          </div>
        </section>

        <section className="container-page py-14" aria-labelledby="diff-heading">
          <h2
            id="diff-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            What {brand.name} does differently
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {competitor.differences.map((d) => (
              <Card key={d.title} className="h-full">
                <CardBody className="p-5 pt-5">
                  <p className="flex items-start gap-2 font-semibold">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                      aria-hidden
                    />
                    {d.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {d.body}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        <section className="container-page pb-14">
          <div className="prose-content">
            <h2>Questions</h2>
            {faqs.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container-page pb-16" aria-labelledby="others-heading">
          <h2 id="others-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            Other comparisons
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {COMPETITORS.filter((c) => c.slug !== slug).map((c) => (
              <Link
                key={c.slug}
                href={`/alternatives/${c.slug}`}
                className="rounded-[var(--radius-full)] border border-[var(--border)] px-3.5 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                {c.name} alternative
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
