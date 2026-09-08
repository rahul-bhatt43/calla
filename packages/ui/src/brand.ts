/**
 * Single source of truth for brand identity. The product name isn't locked in
 * yet, so every user-visible mention of it routes through here — renaming is a
 * one-file change, not a grep-and-pray across 300 SEO pages.
 */
export const brand = {
  name: "Calla",
  /** Used in <title> suffixes and structured data. */
  legalName: "Calla",
  tagline: "Talk to someone new",
  /** ~155 chars — this is the default meta description. */
  description:
    "Meet and video chat with new people from around the world. Free, instant, and built with real safety controls. No downloads, no waiting rooms.",
  domain: "calla.chat",
  url: "https://calla.chat",
  twitter: "@callachat",
  supportEmail: "hello@calla.chat",
  abuseEmail: "abuse@calla.chat",
  /** Bumped whenever the terms change; recorded per-user on acceptance. */
  tosVersion: 1,
  minimumAge: 18,
} as const;

export type Brand = typeof brand;
