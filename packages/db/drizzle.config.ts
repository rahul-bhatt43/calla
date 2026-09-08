import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "./src/load-env";

loadRootEnv();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://callme:callme@localhost:5432/callme",
  },
  strict: true,
  verbose: true,
});
