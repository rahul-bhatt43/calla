import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@callme/ui/brand";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Privacy",
  description: `What ${brand.name} collects, what it can't collect, and why.`,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="container-page py-16">
        <div className="prose-content">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>

          <div className="my-6 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-subtle)] p-4">
            <p className="text-sm font-medium text-[var(--warning)]">
              Draft — not yet reviewed by a lawyer
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              An accurate description of what the software actually does,
              written by the development team. It needs review against GDPR,
              UK GDPR, CCPA and any other regime you operate under before launch.
            </p>
          </div>

          <h2>The short version</h2>
          <p>
            Your conversations are not stored because they never reach us. Video,
            audio and text go directly between the two browsers. We are told that
            a call happened and how long it lasted; we are not told what was in
            it.
          </p>

          <h2>What we store</h2>
          <ul>
            <li>
              <strong>Account</strong> — a generated display name, and if you
              create an account, a username and a password hash. Email is
              optional and only used for recovery.
            </li>
            <li>
              <strong>Call metadata</strong> — who was matched with whom, when,
              for how long, and technical details such as whether the connection
              had to be relayed. No content.
            </li>
            <li>
              <strong>Safety signals</strong> — a hashed device fingerprint and a
              hashed IP address, used to enforce suspensions. Both are one-way
              hashes salted with a server-side secret; we cannot recover the
              original values from them.
            </li>
            <li>
              <strong>Reports</strong> — the reason, your note, and the snapshot
              you chose to attach, if any.
            </li>
          </ul>

          <h2>What we cannot store</h2>
          <p>
            Message content and video. This is an architectural property rather
            than a policy promise: the data path does not run through our
            infrastructure, so there is no point at which we could capture it
            even if we were compelled to. The one exception is a still frame you
            explicitly attach to a report.
          </p>

          <h2>What runs on your device</h2>
          <p>
            The explicit-content classifier runs entirely in your browser. It
            samples the other person&rsquo;s video, evaluates it locally, and
            discards the frame. Nothing is uploaded. The device fingerprint is
            also computed locally and only its hash is sent.
          </p>

          <h2>Cookies</h2>
          <p>
            One essential cookie holding your session token. No advertising or
            third-party analytics cookies.
          </p>

          <h2>Third parties</h2>
          <p>
            We self-host our own infrastructure, including the STUN/TURN servers
            that help browsers connect. A CDN may sit in front of the site to
            cache pages and absorb attacks. We do not sell data and do not embed
            third-party trackers.
          </p>

          <h2>Retention</h2>
          <ul>
            <li>Sessions expire after 60 days (14 for guests).</li>
            <li>Call metadata is kept for 90 days for abuse investigation, then aggregated.</li>
            <li>Report evidence is kept until the report is resolved, plus 30 days.</li>
            <li>Ban records are kept for as long as the ban is in force.</li>
          </ul>

          <h2>Your rights</h2>
          <p>
            You can request a copy of your data or its deletion by emailing{" "}
            <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
            Deleting your account removes your profile and sessions. Ban records
            and reports filed against you are retained, since deleting those on
            request would make bans trivially reversible.
          </p>

          <p className="mt-8">
            See also: <Link href="/safety">how safety works</Link> and{" "}
            <Link href="/terms">terms of use</Link>.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
