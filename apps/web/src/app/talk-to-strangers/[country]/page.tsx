import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Globe2, Languages, Users } from "lucide-react";
import { brand } from "@callme/ui/brand";
import { Button, Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { COUNTRIES, getCountry, peakHours } from "@/lib/countries";
import { breadcrumbSchema, faqSchema, jsonLdScript, pageMeta } from "@/lib/seo";

/**
 * Every country page is generated at build time. Statically rendering the whole
 * set means a crawler never waits on a database, and the pages can be served
 * from the edge cache indefinitely — which is most of the Core Web Vitals score
 * for free.
 */
export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ country: c.slug }));
}

// Unknown slugs 404 rather than being generated on demand: an open-ended URL
// space is how programmatic sites accumulate thin pages that drag down the
// whole domain.
export const dynamicParams = false;

type Props = { params: Promise<{ country: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { country: slug } = await params;
  const country = getCountry(slug);
  if (!country) return {};

  const bare = country.name.replace(/^the /, "");
  return pageMeta({
    title: `Talk to strangers in ${bare}`,
    description: `Free random video chat with ${country.people} people. Meet someone new in ${bare} instantly — no signup, no download, ${brand.minimumAge}+ only.`,
    path: `/talk-to-strangers/${slug}`,
  });
}

export default async function CountryPage({ params }: Props) {
  const { country: slug } = await params;
  const country = getCountry(slug);
  if (!country) notFound();

  const bare = country.name.replace(/^the /, "");
  const nearby = country.nearby.map(getCountry).filter(Boolean);

  const faqs = [
    {
      q: `How do I video chat with ${country.people} people?`,
      a: `Open ${brand.name}, allow camera access and hit start. You can set ${country.langName} as your language to be matched with ${country.people} speakers first.`,
    },
    {
      q: `When are most people from ${bare} online?`,
      a: `Activity peaks in the evening, roughly ${peakHours(country)}. Outside those hours the search widens automatically so you're still matched quickly.`,
    },
    {
      q: `Do I need an account?`,
      a: `No. You can start as a guest immediately. An account is optional and keeps your interests and reputation between visits.`,
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
            { name: "Countries", path: "/talk-to-strangers" },
            { name: bare, path: `/talk-to-strangers/${slug}` },
          ]),
        )}
      />

      <SiteHeader />

      <main id="main">
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="container-page relative py-16 sm:py-24">
            <nav
              aria-label="Breadcrumb"
              className="mb-5 text-sm text-[var(--text-subtle)]"
            >
              <Link href="/" className="hover:text-[var(--text)]">
                Home
              </Link>
              <span className="mx-2">/</span>
              <Link href="/talk-to-strangers" className="hover:text-[var(--text)]">
                Countries
              </Link>
              <span className="mx-2">/</span>
              <span className="text-[var(--text-muted)]">{bare}</span>
            </nav>

            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Talk to strangers in {bare}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
              Free random video chat with {country.people} people. No signup, no
              download — allow your camera and you&rsquo;re talking in seconds.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="px-8">
                <Link href="/chat">Start chatting</Link>
              </Button>
            </div>

            <dl className="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
              <Stat
                icon={<Languages />}
                label="Main language"
                value={country.langName}
              />
              <Stat icon={<Globe2 />} label="Country code" value={country.code} />
              <Stat
                icon={<Clock />}
                label="Busiest hours"
                value={peakHours(country)}
              />
            </dl>
          </div>
        </section>

        <section className="container-page pb-4">
          <div className="prose-content">
            <h2>Meeting people from {bare}</h2>
            <p>
              {brand.name} pairs you with a random person who is online right
              now. Set your language to {country.langName} and pick a few
              interests, and the matchmaker will look for {country.people}{" "}
              speakers who share them before widening the search.
            </p>
            <p>
              That widening matters. A strict country filter sounds appealing
              until you are the only person using it at 4am — you end up staring
              at a loading screen. Instead the search starts narrow and opens up
              after a few seconds, so you always get a conversation rather than a
              spinner.
            </p>

            <h2>What makes this different</h2>
            <ul>
              <li>
                <strong>Your video never touches our servers.</strong> Once two
                browsers are introduced, they connect directly to each other.
              </li>
              <li>
                <strong>Explicit content is blurred on your device</strong> before
                you see it, by a model running in your own browser.
              </li>
              <li>
                <strong>Bans stick.</strong> Everyone has an identity, so a ban
                applies to the account and the device — not just an IP address
                that takes a minute to change.
              </li>
              <li>
                <strong>Text-only mode</strong> works without a camera at all.
              </li>
            </ul>

            <h2>Questions</h2>
            {faqs.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {nearby.length > 0 ? (
          <section
            className="container-page py-12"
            aria-labelledby="nearby-heading"
          >
            <h2 id="nearby-heading" className="text-xl font-semibold tracking-tight">
              Nearby
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {nearby.map((n) => (
                <Link key={n!.slug} href={`/talk-to-strangers/${n!.slug}`}>
                  <Card interactive className="h-full">
                    <CardBody className="flex items-center gap-3 p-4 pt-4">
                      <Users className="size-4 text-[var(--accent)]" aria-hidden />
                      <span className="text-sm font-medium">
                        {n!.name.replace(/^the /, "")}
                      </span>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>

            <Link
              href="/talk-to-strangers"
              className="mt-5 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
            >
              All countries
            </Link>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="flex items-center gap-2 text-xs text-[var(--text-subtle)] [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
