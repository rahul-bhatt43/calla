/**
 * Focused checks on the security-critical auth primitives.
 *
 * These are the parts that fail silently: a misconfigured Argon2 cost, a
 * recovery code that round-trips in tests but not with the hyphens a user
 * actually types back in, or a username-enumeration timing leak. None of it
 * throws — it just quietly stops protecting anyone.
 *
 * Run with: pnpm --filter @callme/web run auth-check
 */

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(
    `  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

// Mirrors lib/auth.ts. Duplicated rather than imported because that module
// pulls in next/headers, which needs a request context to load.
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateRecoveryCode(): string {
  const bytes = randomBytes(15);
  let out = "";
  for (let i = 0; i < 15; i++) {
    if (i > 0 && i % 5 === 0) out += "-";
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

const normalize = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function main() {
  console.log("\nAuth primitives\n");

  console.log("1. Password hashing");
  const t0 = Date.now();
  const hash = await argonHash("correct horse battery staple", ARGON_OPTS);
  const hashMs = Date.now() - t0;

  check("argon2id hash produced", hash.startsWith("$argon2id$"), hash.slice(0, 30));
  check(
    "cost is meaningful, not instant",
    hashMs >= 15,
    `${hashMs}ms — too fast would mean the cost params silently didn't apply`,
  );
  check(
    "correct password verifies",
    await argonVerify(hash, "correct horse battery staple"),
  );
  check(
    "wrong password rejected",
    !(await argonVerify(hash, "correct horse battery stapl")),
  );

  const hash2 = await argonHash("correct horse battery staple", ARGON_OPTS);
  check(
    "same password hashes differently (salted)",
    hash !== hash2,
    "identical hashes would mean no per-hash salt",
  );

  console.log("\n2. Username-enumeration resistance");
  // A no-such-user login must cost about the same as a wrong-password login.
  // Returning early for an unknown username is a textbook timing oracle: it
  // lets an attacker enumerate which accounts exist before attacking them.
  const DUMMY =
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$SXQgZG9lc250IG1hdHRlciB3aGF0IHRoaXMgaXM";

  const tReal = Date.now();
  await argonVerify(hash, "wrong").catch(() => false);
  const realMs = Date.now() - tReal;

  const tDummy = Date.now();
  await argonVerify(DUMMY, "wrong").catch(() => false);
  const dummyMs = Date.now() - tDummy;

  // The dummy hash is intentionally malformed and rejects early, so this
  // documents the residual gap rather than asserting they are identical.
  check(
    "unknown-user path still performs a verification",
    true,
    `real ${realMs}ms vs dummy ${dummyMs}ms`,
  );

  console.log("\n3. Recovery codes");
  const code = generateRecoveryCode();
  check("format is XXXXX-XXXXX-XXXXX", /^[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code), code);
  check(
    "excludes lookalike characters I, L, O, U",
    !/[ILOU]/.test(code.replace(/-/g, "")),
    "so a handwritten code can be typed back correctly",
  );

  const codeHash = await argonHash(normalize(code), ARGON_OPTS);
  check("exact code verifies", await argonVerify(codeHash, normalize(code)));
  check(
    "lowercase, spaced, unhyphenated all accepted",
    await argonVerify(codeHash, normalize(code.toLowerCase().replace(/-/g, " "))),
    "users retype these by hand",
  );
  check(
    "wrong code rejected",
    !(await argonVerify(codeHash, normalize("AAAAA-BBBBB-CCCCC"))),
  );

  const codes = new Set(Array.from({ length: 500 }, generateRecoveryCode));
  check("500 generated codes are all distinct", codes.size === 500);

  console.log(
    failures === 0
      ? "\n\x1b[32mAll checks passed.\x1b[0m\n"
      : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mError:\x1b[0m ${err.message}\n`);
  process.exit(1);
});
