import { cpSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

/**
 * Bundles the signalling server for production (`node dist/server.js`).
 *
 * Two non-obvious constraints drive this configuration.
 *
 * 1. The @callme/* workspace packages MUST be bundled. They ship raw TypeScript
 *    with extensionless relative imports, which is fine for a bundler and for
 *    tsx in dev, but plain Node can neither execute .ts nor resolve `./schema`
 *    without an extension. Externalizing them makes `pnpm dev` work and
 *    `pnpm start` fail — the worst possible split.
 *
 * 2. Several dependencies are CommonJS and call `require()` for Node builtins
 *    at runtime (ioredis reaches for "events"). esbuild's ESM output replaces
 *    `require` with a shim that throws on dynamic calls, so the banner below
 *    restores a real one via createRequire. This is the standard interop fix
 *    and it covers every CJS dependency at once rather than whack-a-mole.
 */
const result = await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false, // Readable stack traces matter more than a smaller file here.

  external: [
    // Loads prebuilt .node binaries per Node ABI; cannot be bundled.
    "uWebSockets.js",
    // Spawns transport workers by resolving module paths at runtime
    // (thread-stream), which breaks once the paths only exist inside a bundle.
    "pino",
    "pino-pretty",
  ],

  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});

if (result.warnings.length > 0) {
  for (const w of result.warnings) console.warn(`[build] ${w.text}`);
}

// matchmake.lua is read from disk at boot rather than inlined, so it has to
// travel alongside the bundle.
mkdirSync("dist", { recursive: true });
cpSync("src/lua", "dist/lua", { recursive: true });

console.log("[build] dist/server.js + dist/lua ready");
