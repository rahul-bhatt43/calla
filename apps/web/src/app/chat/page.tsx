import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { getDb, interests as interestsTable } from "@callme/db";
import { getCurrentUser } from "@/lib/auth";
import { pageMeta } from "@/lib/seo";
import { ChatProviders } from "@/components/providers";
import { ChatClient } from "@/components/chat/ChatClient";

// The chat surface is per-user, ephemeral and has no content a crawler could
// index. Marking it noindex keeps crawl budget on the pages that do.
export const metadata: Metadata = pageMeta({
  title: "Chat",
  description: "Start a video chat with someone new.",
  path: "/chat",
  noIndex: true,
});

// Reads the session cookie, so it cannot be statically rendered.
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  /**
   * Read-only. Next forbids writing cookies while rendering a Server
   * Component, so the guest identity is minted where that *is* legal: the
   * `confirmAge` Server Action for a first-time visitor, or the /api/ws-ticket
   * Route Handler. A first visit therefore renders with no user at all, which
   * is exactly right — the age gate is the first thing they see anyway, and
   * creating an identity before they accept the terms would be backwards.
   */
  const user = await getCurrentUser();

  const availableInterests = await getDb()
    .select({
      id: interestsTable.id,
      label: interestsTable.label,
      category: interestsTable.category,
      emoji: interestsTable.emoji,
    })
    .from(interestsTable)
    .where(eq(interestsTable.isActive, true))
    .orderBy(asc(interestsTable.sortOrder));

  return (
    <ChatProviders>
      <ChatClient
        interests={availableInterests}
        ageConfirmed={Boolean(user?.ageConfirmedAt)}
        displayName={user?.displayName ?? "there"}
        isGuest={user?.isGuest ?? true}
      />
    </ChatProviders>
  );
}
