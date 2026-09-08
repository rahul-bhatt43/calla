import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads the single root `.env` into process.env.
 *
 * A monorepo default of one .env per package means five copies of the same
 * database URL that drift apart the first time someone changes a port. One file
 * at the root is the whole configuration surface; every entry point calls this
 * before reading anything from the environment.
 *
 * Real environment variables always win — this only fills in what is missing,
 * so a container's injected config is never clobbered by a checked-out file.
 *
 * Anchored on process.cwd() rather than import.meta.url deliberately: this
 * module gets bundled to CJS by drizzle-kit, where import.meta does not exist.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();

  // Walk up to the workspace root, identified by pnpm-workspace.yaml, so this
  // behaves the same whether a script runs from a package or from the root.
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      const envPath = resolve(dir, ".env");
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
        } catch {
          /* malformed or unreadable; real env vars still apply */
        }
      }
      return;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return;
    dir = parent;
  }
}
