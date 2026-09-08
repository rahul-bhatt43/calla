import type { MetadataRoute } from "next";
import { absolute } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        /**
         * Only routes a crawler should never fetch at all: /api/ mints
         * credentials and mutates state, and the other two are internal.
         *
         * The app and auth routes are deliberately *not* listed. They carry
         * `noindex` in their metadata instead, and disallowing a page here
         * would prevent the crawler from ever fetching it to see that noindex
         * — leaving it eligible to appear as a bare URL in results. Blocking
         * and de-indexing are different jobs, and combining them backfires.
         */
        disallow: ["/api/", "/admin", "/design"],
      },
    ],
    sitemap: absolute("/sitemap.xml"),
    host: absolute("/"),
  };
}
