import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, Fingerprint, Flag, Lock, ShieldCheck, UserX } from "lucide-react";
import { brand } from "@callme/ui/brand";
import { Card, CardBody } from "@callme/ui";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { faqSchema, jsonLdScript, pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "How safety works",
  description: `How ${brand.name} handles explicit content, reports, bans and privacy — including what we can and can't see.`,
  path: "/safety",
});

const FAQS = [
  {
    q: "Can you see my video or read my messages?",
    a: "No. Both travel directly between the two browsers over an encrypted connection and never pass through our servers. We keep call metadata — duration, whether the connection was relayed — but there is no content for us to store.",
  },
  {
    q: "What happens when I report someone?",
    a: "You're disconnected immediately and will never be matched with them again. The report, plus an optional snapshot you choose to attach, goes into a queue reviewed by a human. Several independent reports in a short window trigger an automatic temporary suspension while it's reviewed.",
  },
  {
    q: "How do bans work if anyone can make a new account?",
    a: "A ban applies to the account, the device and the network address, not just one of the three. Guests get a persistent identity too, so signing up doesn't reset anything — an account created from a banned device inherits the ban.",
  },
  {
    q: "Does the explicit-content detection upload my video?",
    a: "No. The model runs inside your own browser and looks at a downscaled still from the other person's feed every few seconds. Nothing leaves your device. The only image that ever reaches us is one you deliberately attach to a report.",
  },
];

export default function SafetyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(faqSchema(FAQS))}
      />

      <SiteHeader />

      <main id="main">
        <section className="relative overflow-hidden">
          <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
          <div className="container-page relative py-16 sm:py-24">
            <ShieldCheck className="size-9 text-[var(--accent)]" aria-hidden />
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              How safety works here
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              Talking to strangers on camera carries real risk. Here is exactly
              what we do about it, what we can see, and what we can&rsquo;t.
            </p>
          </div>
        </section>

        <section className="container-page pb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Mechanism
              icon={<Cpu />}
              title="Detection runs on your device"
              body="A classifier in your own browser samples the other person's video every few seconds and blurs it if it repeatedly looks explicit — before you see it. It needs two consecutive detections to act, because acting on a single frame would blur innocent people constantly."
            />
            <Mechanism
              icon={<Flag />}
              title="Reports reach a person"
              body="Every report is queued for human review with the context of the call. You can attach a snapshot, which is what makes a report actionable after the call has ended and both people are gone."
            />
            <Mechanism
              icon={<Fingerprint />}
              title="Identity, even for guests"
              body="Everyone has a persistent identity, so behaviour follows a person across sessions. Trust is earned through completed conversations, which is expensive to fake at scale."
            />
            <Mechanism
              icon={<UserX />}
              title="Bans that survive a new tab"
              body="Suspensions apply to the account, the device and the network address together. Creating a fresh account on a banned device inherits the ban rather than clearing it."
            />
            <Mechanism
              icon={<Lock />}
              title="Nothing to leak"
              body="Messages are peer-to-peer. There is no chat history in any database of ours, so there is nothing to breach, sell, or be compelled to hand over."
            />
            <Mechanism
              icon={<ShieldCheck />}
              title="Adults only"
              body={`${brand.name} is ${brand.minimumAge}+. Reports that someone appears to be a minor are acted on immediately rather than waiting for a pattern.`}
            />
          </div>
        </section>

        <section className="container-page py-12">
          <div className="prose-content">
            <h2>What we can&rsquo;t promise</h2>
            <p>
              No automated system catches everything, and anyone claiming
              otherwise is selling something. The on-device classifier will miss
              things and will occasionally flag something harmless. Device
              signals can be spoofed by someone determined enough. Human review
              takes time.
            </p>
            <p>
              What these measures do is raise the cost of abusing the platform
              and shorten how long a bad actor lasts. That is a real
              improvement, not a guarantee — so the most effective tool on the
              page is still the one in your hands:{" "}
              <strong>skip anyone who makes you uncomfortable, immediately</strong>.
              You never owe a stranger an explanation.
            </p>

            <h2>If something goes wrong</h2>
            <p>
              Report it in the app — that carries the most context. For anything
              urgent or involving a minor, email{" "}
              <a href={`mailto:${brand.abuseEmail}`}>{brand.abuseEmail}</a>{" "}
              directly, and contact your local law enforcement.
            </p>

            <h2>Questions</h2>
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}

            <p className="mt-8">
              <Link href="/chat">Start chatting →</Link>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Mechanism({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="h-full">
      <CardBody className="p-5 pt-5">
        <div className="flex size-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-subtle)] text-[var(--accent)] [&_svg]:size-4.5">
          {icon}
        </div>
        <h2 className="mt-3.5 font-semibold">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
      </CardBody>
    </Card>
  );
}
