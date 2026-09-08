import Link from "next/link";
import {
  Cpu,
  EyeOff,
  Flag,
  Gauge,
  Globe2,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb, interests as interestsTable } from "@callme/db";
import { brand } from "@callme/ui/brand";
import { Badge, Button, Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { COUNTRIES } from "@/lib/countries";
import { appSchema, faqSchema, jsonLdScript } from "@/lib/seo";

// Statically rendered and revalidated hourly. This is the page that has to load
// fastest and the one crawlers hit most, so nothing here is allowed to be
// dynamic — the interest list is the only database read and it changes rarely.
export const revalidate = 3600;

const FAQS = [
  {
    q: "Is it free?",
    a: `Yes. ${brand.name} is free to use, with no account required to start. Video and messages travel directly between browsers, so it costs us very little to run.`,
  },
  {
    q: "Do I need to sign up?",
    a: "No. You can start as a guest in one click. Creating an account is optional and lets you keep your interests and reputation across devices.",
  },
  {
    q: "Are my conversations recorded?",
    a: "No. Messages travel peer-to-peer over an encrypted data channel and never pass through our servers, so there is nothing for us to store or hand over. We keep only call metadata such as duration, never content.",
  },
  {
    q: "How do you handle explicit content?",
    a: "A classifier runs inside your own browser and blurs a video feed that looks explicit before you see it. Nothing is uploaded to do this. If you report someone, the report and an optional snapshot are reviewed by a human.",
  },
  {
    q: `Is ${brand.name} an Omegle alternative?`,
    a: `Omegle shut down in November 2023. ${brand.name} covers the same use case — meeting and talking to new people at random — with account-based moderation, interest matching, and a text-only option.`,
  },
  {
    q: "Do I need to install anything?",
    a: "No. It runs in any modern browser on desktop and mobile. You only need to allow camera and microphone access, and text-only chat does not need even that.",
  },
];

export default async function HomePage() {
  const topInterests = await getDb()
    .select({
      id: interestsTable.id,
      label: interestsTable.label,
      emoji: interestsTable.emoji,
    })
    .from(interestsTable)
    .where(eq(interestsTable.isActive, true))
    .orderBy(asc(interestsTable.sortOrder))
    .limit(18);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(appSchema())}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(faqSchema(FAQS))}
      />

      <SiteHeader />

      <main id="main">
        {/* Hero ---------------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />

          <div className="container-page relative py-20 sm:py-28">
            <div className="max-w-3xl">
              <Badge tone="accent">
                <Sparkles />
                No downloads · No waiting rooms
              </Badge>

              <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
                Talk to someone new,
                <br />
                <span className="text-[var(--accent)]">right now.</span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--text-muted)]">
                Random video and text chat with people around the world. Pick
                what you&rsquo;re into, hit start, and you&rsquo;re talking in
                seconds — with safety controls that actually work.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="px-8">
                  <Link href="/chat">Start chatting</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/safety">How it stays safe</Link>
                </Button>
              </div>

              <p className="mt-4 text-sm text-[var(--text-subtle)]">
                {brand.minimumAge}+ only. Free forever.
              </p>
            </div>
          </div>
        </section>

        {/* Value props --------------------------------------------------- */}
        <section className="container-page py-16" aria-labelledby="why-heading">
          <h2 id="why-heading" className="sr-only">
            Why {brand.name}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<Lock />}
              title="Nothing to leak"
              body="Video and messages go straight between the two browsers. They never touch our servers, so there's no chat history to breach, sell, or subpoena."
            />
            <Feature
              icon={<EyeOff />}
              title="Explicit content, caught locally"
              body="A model runs in your own browser and blurs a feed that looks explicit before you have to see it. Your video is never uploaded for this."
            />
            <Feature
              icon={<Sparkles />}
              title="Matched on what you like"
              body="Choose interests and we'll find someone who shares them — then widen the search automatically rather than leaving you waiting."
            />
            <Feature
              icon={<Zap />}
              title="Connects in seconds"
              body="Direct peer-to-peer connections with no server in the middle, so latency is as low as the internet allows."
            />
            <Feature
              icon={<Flag />}
              title="Reports go to a human"
              body="Everyone has an identity, even guests. Bans apply to the account and the device, so they don't wash off with a new tab."
            />
            <Feature
              icon={<Globe2 />}
              title="Anywhere, any browser"
              body="Works on phones and desktops with nothing to install. Text-only mode needs no camera at all."
            />
          </div>
        </section>

        {/* Interests ----------------------------------------------------- */}
        <section
          className="container-page py-16"
          aria-labelledby="interests-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="interests-heading"
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Find your people
              </h2>
              <p className="mt-2 max-w-xl text-[var(--text-muted)]">
                Pick a few interests and we&rsquo;ll try to pair you with someone
                who shares them.
              </p>
            </div>
            <Link
              href="/interests"
              className="text-sm text-[var(--accent)] underline underline-offset-4"
            >
              All interests
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {topInterests.map((i) => (
              <Link
                key={i.id}
                href={`/interests/${i.id}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--text-muted)] transition-[border-color,color] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                {i.emoji ? <span aria-hidden>{i.emoji}</span> : null}
                {i.label}
              </Link>
            ))}
          </div>
        </section>

        {/* How it works -------------------------------------------------- */}
        <section className="container-page py-16" aria-labelledby="how-heading">
          <h2
            id="how-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            How it works
          </h2>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "01",
                title: "Pick your interests",
                body: "Optional, but it makes the conversations better. Or just hit start.",
              },
              {
                n: "02",
                title: "Get matched",
                body: "We pair you with someone available. If nobody matches your interests, the search widens on its own.",
              },
              {
                n: "03",
                title: "Talk, or move on",
                body: "Hit Next whenever you like. Your camera stays on between matches, so there's no flicker or delay.",
              },
            ].map((step) => (
              <li key={step.n}>
                <span className="font-mono text-sm text-[var(--accent)]">
                  {step.n}
                </span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Technical note ------------------------------------------------ */}
        <section className="container-page py-16">
          <Card>
            <CardBody className="flex flex-col gap-5 p-7 sm:flex-row sm:items-start">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-subtle)]">
                <Cpu className="size-5 text-[var(--accent)]" aria-hidden />
              </div>
              <div className="prose-content">
                <h2 className="text-xl font-semibold tracking-tight">
                  Built peer-to-peer, on purpose
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Most chat platforms route every frame of video and every
                  message through their own servers. We don&rsquo;t. Once
                  we&rsquo;ve introduced two browsers to each other — a few
                  kilobytes of setup — they talk directly, and we drop out of the
                  conversation entirely.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  That&rsquo;s what keeps this fast, and it&rsquo;s also why we
                  can say plainly that we don&rsquo;t store your messages:
                  they never reach us in the first place.
                </p>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Countries ----------------------------------------------------- */}
        <section
          className="container-page py-16"
          aria-labelledby="countries-heading"
        >
          <h2
            id="countries-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Talk to people in
          </h2>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5 text-sm">
            {COUNTRIES.map((c) => (
              <Link
                key={c.slug}
                href={`/talk-to-strangers/${c.slug}`}
                className="text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
              >
                {c.name.replace(/^the /, "")}
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ ----------------------------------------------------------- */}
        <section className="container-page py-16" aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Questions
          </h2>

          <div className="mt-8 max-w-3xl divide-y divide-[var(--border)]">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span
                    aria-hidden
                    className="text-[var(--text-subtle)] transition-transform duration-[var(--dur-fast)] group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA ----------------------------------------------------- */}
        <section className="container-page pb-8 pt-4">
          <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] p-10 text-center sm:p-16">
            <div className="aurora absolute inset-0" aria-hidden />
            <div className="relative">
              <Gauge className="mx-auto size-8 text-[var(--accent)]" aria-hidden />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                Someone&rsquo;s waiting
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">
                No signup, no download. Just click and start talking.
              </p>
              <Button asChild size="lg" className="mt-7 px-8">
                <Link href="/chat">Start chatting</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card interactive className="h-full">
      <CardBody className="p-5 pt-5">
        <div className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-subtle)] text-[var(--accent)] [&_svg]:size-4.5">
          {icon}
        </div>
        <h3 className="mt-3.5 font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
      </CardBody>
    </Card>
  );
}
