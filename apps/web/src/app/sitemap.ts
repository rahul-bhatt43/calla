import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb, interests as interestsTable } from "@callme/db";
import { COMPETITORS } from "@/lib/competitors";
import { COUNTRIES } from "@/lib/countries";
import { absolute } from "@/lib/seo";

// Regenerated daily rather than per-request: a sitemap that hits the database
// on every crawler fetch is a free denial-of-service vector.
export const revalidate = 86_400;

/**
 * One sitemap for now. Next splits automatically past 50,000 URLs via
 * generateSitemaps(), and this set is nowhere near that — adding the machinery
 * before it is needed would be complexity with no payoff.
 *
 * /chat and the auth routes are deliberately absent: they are noindex, and
 * listing a noindex URL in a sitemap is a contradiction crawlers report as an
 * error.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const topics = await getDb()
    .select({ id: interestsTable.id })
    .from(interestsTable)
    .where(eq(interestsTable.isActive, true));

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absolute("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absolute("/interests"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/talk-to-strangers"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/safety"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absolute("/terms"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absolute("/privacy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const countryRoutes: MetadataRoute.Sitemap = COUNTRIES.map((c) => ({
    url: absolute(`/talk-to-strangers/${c.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const interestRoutes: MetadataRoute.Sitemap = topics.map((t) => ({
    url: absolute(`/interests/${t.id}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const alternativeRoutes: MetadataRoute.Sitemap = COMPETITORS.map((c) => ({
    url: absolute(`/alternatives/${c.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    ...staticRoutes,
    ...countryRoutes,
    ...interestRoutes,
    ...alternativeRoutes,
  ];
}
