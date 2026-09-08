import type { Metadata } from "next";
import { brand } from "@callme/ui/brand";
import { pageMeta } from "@/lib/seo";
import { RecoverForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = pageMeta({
  title: "Recover your account",
  description: `Reset your ${brand.name} password with a recovery code.`,
  path: "/recover",
  noIndex: true,
});

export const dynamic = "force-dynamic";

export default function RecoverPage() {
  return <RecoverForm />;
}
