import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@callme/ui/brand";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Terms of use",
  description: `The rules for using ${brand.name}.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <SiteHeader />

      <main id="main" className="container-page py-16">
        <div className="prose-content">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of use</h1>
          <p className="text-sm text-[var(--text-subtle)]">
            Version {brand.tosVersion}
          </p>

          {/* Visible on the live page on purpose. A plausible-looking terms
              document that has never been reviewed is worse than an obvious
              draft, because it invites everyone to assume it was. */}
          <div className="my-6 rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[var(--warning-subtle)] p-4">
            <p className="text-sm font-medium text-[var(--warning)]">
              Draft — not yet reviewed by a lawyer
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              This is a plain-language starting point written by the development
              team. It must be reviewed by qualified counsel in your operating
              jurisdictions before launch.
            </p>
          </div>

          <h2>1. Who can use {brand.name}</h2>
          <p>
            You must be at least {brand.minimumAge} years old. By using the
            service you confirm that you are. We may suspend any account we
            believe belongs to someone underage, and reports that a user appears
            to be a minor are acted on immediately.
          </p>

          <h2>2. What you may not do</h2>
          <ul>
            <li>Nudity, sexual content, or sexual solicitation.</li>
            <li>Harassment, hate speech, threats, or targeting someone for abuse.</li>
            <li>Sharing content involving minors, in any form.</li>
            <li>Graphic violence, or content promoting self-harm.</li>
            <li>Recording or redistributing another person without their consent.</li>
            <li>Spam, advertising, scams, or automated use of the service.</li>
            <li>Attempting to identify, locate, or contact someone off-platform against their wishes.</li>
            <li>Circumventing a suspension.</li>
          </ul>

          <h2>3. Your account</h2>
          <p>
            You may use {brand.name} as a guest or create an account. Either way
            you have a persistent identity, and your conduct history follows it.
            Creating a new account does not reset a suspension.
          </p>
          <p>
            If you set a recovery code, keep it somewhere safe. It is shown once
            and we cannot recover it for you — that is a deliberate property of
            how it is stored, not an oversight.
          </p>

          <h2>4. Moderation and suspension</h2>
          <p>
            We may suspend or permanently ban access for conduct that breaks
            these terms. Suspensions may apply to an account, a device, a
            network address, or all three. Repeated or severe violations result
            in permanent bans without prior warning.
          </p>

          <h2>5. What we do and don&rsquo;t see</h2>
          <p>
            Video, audio, and text messages travel directly between participants
            and do not pass through our servers. We therefore do not have, and
            cannot produce, a record of what was said. We do retain call
            metadata and any evidence a user attaches to a report. See our{" "}
            <Link href="/privacy">privacy policy</Link>.
          </p>

          <h2>6. No warranty</h2>
          <p>
            The service is provided as-is. We do not screen users in advance and
            cannot guarantee anyone&rsquo;s conduct or identity. You interact
            with strangers at your own risk. Skip or report anyone who makes you
            uncomfortable.
          </p>

          <h2>7. Changes</h2>
          <p>
            We may update these terms. Material changes will be signalled by a
            new version number, and continued use after that constitutes
            acceptance.
          </p>

          <h2>8. Contact</h2>
          <p>
            General: <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
            <br />
            Abuse and urgent safety: <a href={`mailto:${brand.abuseEmail}`}>{brand.abuseEmail}</a>
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
