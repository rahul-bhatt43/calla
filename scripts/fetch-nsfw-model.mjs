#!/usr/bin/env node
/**
 * Vendors the NSFW classifier weights into apps/web/public/models/nsfw/.
 *
 * Run once after cloning:  node scripts/fetch-nsfw-model.mjs
 *
 * Why vendor rather than load from a CDN at runtime? Because a CDN fetch on
 * every session is exactly the third-party dependency this project is built to
 * avoid: it leaks our users' IP addresses to someone else, it breaks when that
 * host does, and it puts a stranger's JavaScript-adjacent asset in the path of
 * a safety feature. Downloading it once at setup makes it ours.
 *
 * Shard filenames are read out of model.json's weightsManifest rather than
 * hardcoded, so this keeps working if the model is re-sharded upstream.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../apps/web/public/models/nsfw");

// MobileNetV2 build from the nsfwjs project (Apache-2.0).
const BASE =
  process.env.NSFW_MODEL_BASE ??
  "https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2/";

async function fetchTo(url, destName) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(OUT_DIR, destName), buf);
  console.log(`  ✓ ${destName} (${(buf.byteLength / 1024).toFixed(0)} KB)`);
  return buf;
}

try {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Fetching NSFW model into ${OUT_DIR}`);

  const modelJson = await fetchTo(`${BASE}model.json`, "model.json");
  const manifest = JSON.parse(modelJson.toString("utf8"));

  const shards = (manifest.weightsManifest ?? []).flatMap((g) => g.paths ?? []);
  if (shards.length === 0) {
    throw new Error("model.json contained no weight shards — is the URL right?");
  }

  for (const shard of shards) {
    await fetchTo(`${BASE}${shard}`, shard);
  }

  console.log(`\nDone. ${shards.length + 1} files vendored.`);
  console.log("These are gitignored; re-run this script on a fresh clone.");
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  console.error(
    "\nThe app still runs without this — the on-device NSFW blur simply stays\n" +
      "off and reporting continues to work. Set NSFW_MODEL_BASE to override the\n" +
      "source if the default path has moved.",
  );
  process.exitCode = 1;
}
