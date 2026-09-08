import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { brand } from "@callme/ui/brand";
import { getCurrentUser } from "@/lib/auth";
import { pageMeta } from "@/lib/seo";
import { LogInForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = pageMeta({
  title: "Log in",
  description: `Log in to ${brand.name}.`,
  path: "/login",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default async function LogInPage() {
  const user = await getCurrentUser();
  if (user && !user.isGuest) redirect("/chat");

  return <LogInForm />;
}
