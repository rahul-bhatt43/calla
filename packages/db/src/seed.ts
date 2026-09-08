import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { interests } from "./schema";

/**
 * The interest taxonomy is seeded rather than hardcoded in the app because it
 * serves two masters: matchmaking queue partitioning, and the
 * /interests/[topic] SEO pages. One source of truth keeps them in lockstep.
 */
const SEED_INTERESTS: Array<{
  id: string;
  label: string;
  category: string;
  emoji: string;
  blurb: string;
}> = [
  // --- music ---------------------------------------------------------------
  { id: "music", label: "Music", category: "creative", emoji: "🎵", blurb: "Swap what you're listening to and find people whose taste overlaps yours." },
  { id: "guitar", label: "Guitar", category: "creative", emoji: "🎸", blurb: "Trade riffs, tabs and practice tips with other players on camera." },
  { id: "producing", label: "Music production", category: "creative", emoji: "🎛️", blurb: "Talk DAWs, mixing and sample digging with other producers." },
  { id: "singing", label: "Singing", category: "creative", emoji: "🎤", blurb: "Warm up, duet, or just find someone who wants to hear the take." },
  { id: "art", label: "Art & drawing", category: "creative", emoji: "🎨", blurb: "Show your sketchbook and get an unfiltered second opinion." },
  { id: "photography", label: "Photography", category: "creative", emoji: "📷", blurb: "Compare shots, gear and editing workflows with other photographers." },
  { id: "writing", label: "Writing", category: "creative", emoji: "✍️", blurb: "Talk drafts, blocks and process with people who actually finish things." },

  // --- language ------------------------------------------------------------
  { id: "language-exchange", label: "Language exchange", category: "learning", emoji: "🗣️", blurb: "Practise a language with a native speaker who wants to practise yours." },
  { id: "english-practice", label: "English practice", category: "learning", emoji: "🇬🇧", blurb: "Get real conversational English reps with a patient stranger." },
  { id: "spanish", label: "Spanish", category: "learning", emoji: "🇪🇸", blurb: "Conversational Spanish with speakers from across the Spanish-speaking world." },
  { id: "japanese", label: "Japanese", category: "learning", emoji: "🇯🇵", blurb: "Practise Japanese conversation beyond what an app can teach you." },
  { id: "french", label: "French", category: "learning", emoji: "🇫🇷", blurb: "Real French conversation practice, accent and all." },
  { id: "study", label: "Study together", category: "learning", emoji: "📚", blurb: "Body-doubling for focus: camera on, both of you working." },
  { id: "coding", label: "Coding", category: "learning", emoji: "💻", blurb: "Rubber-duck a bug or argue about frameworks with another developer." },
  { id: "science", label: "Science", category: "learning", emoji: "🔬", blurb: "Talk physics, biology and everything that needs a whiteboard." },
  { id: "philosophy", label: "Philosophy", category: "learning", emoji: "🤔", blurb: "Long-form conversations about the questions that don't resolve." },

  // --- gaming --------------------------------------------------------------
  { id: "gaming", label: "Gaming", category: "gaming", emoji: "🎮", blurb: "Find someone mid-backlog who wants to talk about what they're playing." },
  { id: "esports", label: "Esports", category: "gaming", emoji: "🏆", blurb: "Break down matches and metas with people who actually watch." },
  { id: "minecraft", label: "Minecraft", category: "gaming", emoji: "⛏️", blurb: "Show your build and steal ideas from someone else's." },
  { id: "chess", label: "Chess", category: "gaming", emoji: "♟️", blurb: "Analyse games and openings with an opponent who talks back." },
  { id: "tabletop", label: "Tabletop & D&D", category: "gaming", emoji: "🎲", blurb: "Campaign stories, homebrew rules, and character builds." },

  // --- lifestyle -----------------------------------------------------------
  { id: "fitness", label: "Fitness", category: "lifestyle", emoji: "🏋️", blurb: "Training talk with people who are actually in the gym." },
  { id: "running", label: "Running", category: "lifestyle", emoji: "🏃", blurb: "Splits, races and the recurring injury you should rest." },
  { id: "cooking", label: "Cooking", category: "lifestyle", emoji: "🍳", blurb: "Cook alongside a stranger and steal their family recipe." },
  { id: "travel", label: "Travel", category: "lifestyle", emoji: "✈️", blurb: "Get real local advice from someone who lives where you're going." },
  { id: "pets", label: "Pets", category: "lifestyle", emoji: "🐕", blurb: "The one interest where showing rather than telling actually works." },
  { id: "gardening", label: "Gardening", category: "lifestyle", emoji: "🌱", blurb: "Diagnose a sick plant with someone who's killed the same one." },
  { id: "movies", label: "Movies & TV", category: "lifestyle", emoji: "🎬", blurb: "Recommendations from a human instead of an algorithm." },
  { id: "books", label: "Books", category: "lifestyle", emoji: "📖", blurb: "Find out what someone with different taste is reading." },
  { id: "anime", label: "Anime", category: "lifestyle", emoji: "🌸", blurb: "Seasonal picks, deep cuts and the arc you're still not over." },
  { id: "football", label: "Football", category: "lifestyle", emoji: "⚽", blurb: "Argue about the weekend with a fan from another league." },
  { id: "basketball", label: "Basketball", category: "lifestyle", emoji: "🏀", blurb: "Talk games, trades and takes across time zones." },

  // --- social --------------------------------------------------------------
  { id: "just-chatting", label: "Just chatting", category: "social", emoji: "💬", blurb: "No topic, no agenda — the original reason people came here." },
  { id: "deep-talks", label: "Deep talks", category: "social", emoji: "🌌", blurb: "For when small talk isn't what you're looking for." },
  { id: "making-friends", label: "Making friends", category: "social", emoji: "🤝", blurb: "People who want the conversation to go somewhere past one call." },
  { id: "debate", label: "Debate", category: "social", emoji: "⚖️", blurb: "Disagree productively with someone who doesn't share your feed." },
  { id: "comedy", label: "Comedy", category: "social", emoji: "😂", blurb: "Bad jokes, good delivery, low stakes." },
  { id: "music-taste", label: "Rate my playlist", category: "social", emoji: "📻", blurb: "Play a track, get an honest reaction in real time." },
  { id: "night-owls", label: "Night owls", category: "social", emoji: "🌙", blurb: "It's 3am somewhere, and someone else is up too." },
  { id: "introverts", label: "Introverts", category: "social", emoji: "🫧", blurb: "Lower-key conversations with people who also find this hard." },
];

const db = getDb();

console.log(`[db] seeding ${SEED_INTERESTS.length} interests…`);

await db
  .insert(interests)
  .values(
    SEED_INTERESTS.map((row, i) => ({ ...row, sortOrder: i, isActive: true })),
  )
  // Idempotent: re-running the seed updates copy in place rather than failing,
  // so editing an interest blurb is just an edit-and-reseed.
  .onConflictDoUpdate({
    target: interests.id,
    set: {
      label: sql`excluded.label`,
      category: sql`excluded.category`,
      emoji: sql`excluded.emoji`,
      blurb: sql`excluded.blurb`,
      sortOrder: sql`excluded.sort_order`,
    },
  });

console.log("[db] seed complete");
process.exit(0);
