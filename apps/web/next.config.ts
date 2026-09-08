import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * This machine's LAN addresses, so `next dev` accepts requests for /_next/*
 * assets from a phone on the same wifi. Without it Next warns now and will
 * refuse outright in a future major, which breaks device testing entirely.
 *
 * Computed rather than configured: a DHCP lease changes, and nobody should
 * have to edit a config file to test on their own phone.
 */
function lanOrigins(): string[] {
  const origins = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const addr of addresses ?? []) {
      if (addr.family === "IPv4" && !addr.internal) origins.add(addr.address);
    }
  }
  return [...origins];
}

/**
 * Next only auto-loads .env from its own project directory; ours lives at the
 * workspace root so every app reads one file.
 *
 * Inlined rather than imported from @callme/db because Next compiles this file
 * to CommonJS, where that package's ESM `.js` import specifiers fail to
 * resolve. Ten lines here is cheaper than reshaping a package to suit a config
 * loader's module format.
 */
(function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      const envPath = resolve(dir, ".env");
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
        } catch {
          /* real env vars still apply */
        }
      }
      return;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return;
    dir = parent;
  }
})();

const config: NextConfig = {
  reactStrictMode: true,

  // Workspace packages ship raw TypeScript rather than a build step, so Next
  // compiles them alongside the app.
  transpilePackages: ["@callme/ui", "@callme/protocol", "@callme/db"],

  /**
   * Self-contained server bundle for the Docker image.
   *
   * Opt-in rather than always-on: standalone output builds its node_modules
   * tree out of symlinks, which Windows refuses to create without Developer
   * Mode or an elevated shell. That turns a routine local `next build` into a
   * hard failure for no benefit, since nobody deploys from a dev machine.
   * infra/Dockerfile.web sets this.
   */
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,

  eslint: { ignoreDuringBuilds: true },

  // Dev-only; has no effect on a production build.
  allowedDevOrigins: lanOrigins(),

  experimental: {
    // Rewrites bare `lucide-react` imports to per-icon paths. Without it a
    // single icon import pulls the whole set into the landing bundle, which is
    // the difference between a ~40KB and a ~600KB first load.
    optimizePackageImports: ["lucide-react", "@callme/ui"],
  },

  images: {
    formats: ["image/avif", "image/webp"],
  },

  webpack: (config) => {
    // Escape hatch: Next's minify plugin can fail while *constructing* its own
    // error object, which replaces the real compile failure with a useless
    // "WebpackError is not a constructor". Building with NO_MINIFY=1 skips
    // minification so the actual error surfaces.
    if (process.env.NO_MINIFY) config.optimization.minimize = false;
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Camera and mic are the product; everything else is refused.
            value: "camera=(self), microphone=(self), geolocation=(), payment=()",
          },
        ],
      },
      {
        // The NSFW model weights are content-addressed and never change.
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default config;
