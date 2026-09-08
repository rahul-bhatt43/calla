import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DesignSystemShowcase } from "@/components/marketing/DesignShowcase";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Design system",
  description: "Internal component reference.",
  path: "/design",
  noIndex: true,
});

/**
 * A living styleguide: every component, in every state, on one page.
 *
 * The value is regression-catching. A token change or a variant tweak shows up
 * here immediately across every component that consumes it, which is far faster
 * than discovering a broken disabled state weeks later in the middle of a call.
 * Rendering both themes side by side is what catches the classic bug of a
 * colour that only has a definition in one of them.
 */
export default function DesignPage() {
  // Never ships to production. It exposes nothing sensitive, but it is internal
  // tooling and there is no reason for it to exist on the public site.
  if (process.env.NODE_ENV === "production") notFound();

  return <DesignSystemShowcase />;
}
