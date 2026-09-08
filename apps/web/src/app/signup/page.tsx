import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@callme/ui/brand";
import { getCurrentUser } from "@/lib/auth";
import { pageMeta } from "@/lib/seo";
import { SignUpForm } from "@/components/auth/AuthForms";

// Auth routes are noindex: they're transactional, personalised, and would only
// consume crawl budget that belongs to the content pages.
export const metadata: Metadata = pageMeta({
  title: "Create an account",
  description: `Create a free ${brand.name} account.`,
  path: "/signup",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const user = await getCurrentUser();
  // Already registered — nothing here to do.
  if (user && !user.isGuest) redirect("/chat");

  return <SignUpForm />;
}
