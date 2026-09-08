import Link from "next/link";
import { brand } from "@callme/ui/brand";
import { Button } from "@callme/ui";
import { ThemeToggle } from "./ThemeToggle";

function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight"
      aria-label={`${brand.name} home`}
    >
      {/* Inline SVG rather than an <img>: no extra request, no layout shift,
          and it inherits the theme's accent colour for free. */}
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <rect
          width="26"
          height="26"
          rx="8"
          fill="var(--accent)"
        />
        <path
          d="M8 10.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5Z"
          fill="var(--accent-fg)"
        />
        <path
          d="M17.5 11.2 20 9.6v6.8l-2.5-1.6v-3.6Z"
          fill="var(--accent-fg)"
          opacity="0.75"
        />
      </svg>
      {brand.name}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-lg">
      <div className="container-page flex h-[var(--header-height)] items-center gap-6">
        <Logo />

        <nav
          className="ml-auto hidden items-center gap-6 text-sm text-[var(--text-muted)] md:flex"
          aria-label="Main"
        >
          <Link href="/interests" className="transition-colors hover:text-[var(--text)]">
            Interests
          </Link>
          <Link href="/safety" className="transition-colors hover:text-[var(--text)]">
            Safety
          </Link>
          <Link
            href="/alternatives/omegle"
            className="transition-colors hover:text-[var(--text)]"
          >
            Compare
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/chat">Start chatting</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-[var(--border)] py-12">
      <div className="container-page">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
              {brand.tagline}. Free, instant, and built with real safety
              controls.
            </p>
          </div>

          <FooterColumn
            title="Explore"
            links={[
              { href: "/chat", label: "Start chatting" },
              { href: "/interests", label: "Browse interests" },
              { href: "/talk-to-strangers", label: "By country" },
              { href: "/alternatives/omegle", label: "Omegle alternative" },
            ]}
          />

          <FooterColumn
            title="Safety"
            links={[
              { href: "/safety", label: "How safety works" },
              { href: "/terms", label: "Terms of use" },
              { href: "/privacy", label: "Privacy" },
              { href: `mailto:${brand.abuseEmail}`, label: "Report abuse" },
            ]}
          />

          <FooterColumn
            title="Contact"
            links={[{ href: `mailto:${brand.supportEmail}`, label: brand.supportEmail }]}
          />
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-subtle)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {brand.legalName}. {brand.minimumAge}+ only.
          </p>
          <p>Video and messages travel directly between browsers.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="transition-colors hover:text-[var(--text)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
