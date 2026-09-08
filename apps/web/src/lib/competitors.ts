import { brand } from "@callme/ui/brand";

/**
 * Comparison pages for /alternatives/[competitor].
 *
 * These target the highest-intent query class in the category — someone
 * searching "omegle alternative" has already decided they want this product and
 * is only choosing where. The copy stays factual and verifiable: claims about
 * other services are limited to publicly documented facts, and the contrast is
 * drawn on what we actually do rather than on what they allegedly do badly.
 */
export interface Competitor {
  slug: string;
  name: string;
  /** Neutral, factual framing of the service. */
  summary: string;
  /** Why someone is searching for an alternative. */
  context: string;
  status: "shut down" | "active";
  /** Differences we can substantiate about our own product. */
  differences: Array<{ title: string; body: string }>;
}

const SHARED_DIFFERENCES: Competitor["differences"] = [
  {
    title: "Accounts, not pure anonymity",
    body: `Everyone on ${brand.name} has an identity — even guests get a persistent one tied to their device. That single decision is what makes a ban mean something. Fully anonymous services can only ever ban an IP address, which takes about a minute to change.`,
  },
  {
    title: "Explicit content is caught on your device",
    body: `A classifier runs in your own browser and blurs a video feed that looks explicit before you have to see it. Nothing is uploaded to do this — the check happens locally, which is both faster and more private than sending your video to someone's server for review.`,
  },
  {
    title: "Nothing to leak, by design",
    body: `Video and text both travel directly between the two browsers. Messages never pass through our servers, so there is no message history to subpoena, sell, or lose in a breach. We could not hand over your conversations if we wanted to.`,
  },
  {
    title: "Interest matching that actually gives up",
    body: `Pick what you're into and we'll try to match on it — but if nobody suitable is around, the search widens on its own after a few seconds instead of leaving you staring at a spinner.`,
  },
];

export const COMPETITORS: Competitor[] = [
  {
    slug: "omegle",
    name: "Omegle",
    status: "shut down",
    summary:
      "Omegle was the service that defined random video chat, launched in 2009 and run for fourteen years. It shut down permanently in November 2023.",
    context:
      "Its founder closed it following sustained legal pressure over abuse that took place on the platform, writing that operating it was no longer sustainable. Because it is gone, people searching for it are looking for somewhere to go rather than a comparison.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "chatroulette",
    name: "Chatroulette",
    status: "active",
    summary:
      "Chatroulette launched in 2009 and popularised the one-click random video pairing model. It is still running.",
    context:
      "People generally look for alternatives because they want interest-based matching, a text option, or a modern interface on a phone.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "speaklar",
    name: "Speaklar",
    status: "active",
    summary:
      "Speaklar is a random chat service in the same category, oriented toward talking with strangers by voice and text.",
    context:
      "Searchers comparing it usually want to know how video quality, matching and moderation differ.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "emerald-chat",
    name: "Emerald Chat",
    status: "active",
    summary:
      "Emerald Chat is a random chat platform that added interest tags and karma-style reputation to the classic format.",
    context:
      "Comparisons usually come down to matching quality and how the reputation system affects who you meet.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "ometv",
    name: "OmeTV",
    status: "active",
    summary:
      "OmeTV is a random video chat service available on the web and as a mobile app.",
    context:
      "People comparing it are typically weighing moderation and whether they need to install anything.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "chatspin",
    name: "Chatspin",
    status: "active",
    summary:
      "Chatspin offers random video chat with country and gender filters, plus face masks and effects.",
    context:
      "Alternatives are usually sought over filter availability and connection reliability.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "camsurf",
    name: "Camsurf",
    status: "active",
    summary:
      "Camsurf is a random video chat service with country filtering and a mobile app, positioned around moderated, family-friendly use.",
    context:
      "Comparisons tend to focus on how strictly each service enforces its rules.",
    differences: SHARED_DIFFERENCES,
  },
  {
    slug: "shagle",
    name: "Shagle",
    status: "active",
    summary:
      "Shagle is a random video chat platform offering gender and location filters on a freemium model.",
    context:
      "People look for alternatives mainly when they want the filtering without a subscription.",
    differences: SHARED_DIFFERENCES,
  },
];

const bySlug = new Map(COMPETITORS.map((c) => [c.slug, c]));
export const getCompetitor = (slug: string) => bySlug.get(slug);
