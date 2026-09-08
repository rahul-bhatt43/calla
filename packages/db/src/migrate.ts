import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRootEnv } from "./load-env";

loadRootEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

const url =
  process.env.DATABASE_URL ??
  "postgresql://callme:callme@localhost:5432/callme";

// max: 1 — migrations must run serially on a single connection.
const client = postgres(url, { max: 1 });

try {
  console.log("[db] running migrations…");
  await migrate(drizzle(client), {
    migrationsFolder: resolve(__dirname, "../drizzle"),
  });
  console.log("[db] migrations complete");
} catch (err) {
  console.error("[db] migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
