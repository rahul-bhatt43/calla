#!/usr/bin/env node
/**
 * Frees the ports this project's dev servers use.
 *
 *   node scripts/free-ports.mjs            kill whatever is listening
 *   node scripts/free-ports.mjs --dry      just show what's there
 *
 * Exists because a dev server that dies without releasing its socket — a
 * crashed tsx watch, a detached `pnpm start`, a terminal closed mid-run — leaves
 * `next dev` failing with EADDRINUSE and no clue which process to blame.
 *
 * Safety: the port list is derived from .env, the same configuration the apps
 * themselves read. It will never touch a port this project isn't configured to
 * use, so an unrelated service on :3000 is not at risk. Every process is named
 * before it is killed, so a surprise is visible rather than silent.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");

if (existsSync(resolve(root, ".env"))) {
  try {
    process.loadEnvFile(resolve(root, ".env"));
  } catch {
    /* fall through to defaults */
  }
}

/** Port the web app listens on, taken from the site URL so it stays in sync. */
function webPort() {
  try {
    return Number(new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").port) || 3100;
  } catch {
    return 3100;
  }
}

const TARGETS = [
  { port: webPort(), label: "web (Next.js)" },
  { port: Number(process.env.SIGNAL_PORT) || 3001, label: "signal" },
];

const isWindows = process.platform === "win32";

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // Non-zero exit usually just means "no match" for these tools.
    return "";
  }
}

/** PIDs listening on a port. */
function listenersOn(port) {
  if (isWindows) {
    const out = sh("netstat", ["-ano", "-p", "tcp"]);
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const cols = line.trim().split(/\s+/);
      const local = cols[1] ?? "";
      // Match the port exactly — endsWith(":310") would also hit :31000.
      if (!local.endsWith(`:${port}`)) continue;
      const pid = Number(cols[cols.length - 1]);
      if (Number.isInteger(pid) && pid > 4) pids.add(pid);
    }
    return [...pids];
  }

  const out = sh("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return out
    .split(/\s+/)
    .map(Number)
    .filter((p) => Number.isInteger(p) && p > 1);
}

function isAlive(pid) {
  try {
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists but belongs to someone else.
    return err.code === "EPERM";
  }
}

function processName(pid) {
  if (isWindows) {
    const out = sh("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"]);
    return out.split(",")[0]?.replace(/"/g, "").trim() || "unknown";
  }
  return sh("ps", ["-p", String(pid), "-o", "comm="]).trim() || "unknown";
}

function kill(pid) {
  if (isWindows) {
    // /T takes the process tree with it: pnpm and turbo spawn the actual
    // listener as a child, and killing only one leaves the other orphaned.
    execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
      stdio: "ignore",
    });
  } else {
    process.kill(pid, "SIGKILL");
  }
}

let found = 0;
let killed = 0;

for (const { port, label } of TARGETS) {
  const pids = listenersOn(port);

  if (pids.length === 0) {
    console.log(`  :${port}  free            ${label}`);
    continue;
  }

  for (const pid of pids) {
    found++;
    const name = processName(pid);

    if (dry) {
      console.log(`  :${port}  in use by ${name} (pid ${pid})   ${label}`);
      continue;
    }

    try {
      kill(pid);
      killed++;
      console.log(`  :${port}  killed ${name} (pid ${pid})      ${label}`);
    } catch (err) {
      // A tree kill takes children with it, so by the time we reach a PID
      // discovered in the same scan it may already be gone. taskkill still
      // exits non-zero for that, and reporting it as a failure sends people
      // hunting for a process that no longer exists.
      if (!isAlive(pid)) {
        killed++;
        console.log(
          `  :${port}  ${name} (pid ${pid}) already exited   ${label}`,
        );
      } else {
        console.log(
          `  :${port}  could NOT kill ${name} (pid ${pid}) — ${err.message}`,
        );
        console.log(
          `         It may belong to another user; try an elevated terminal.`,
        );
      }
    }
  }
}

if (found === 0) {
  console.log("\nAll project ports are already free.");
} else if (dry) {
  console.log(`\n${found} port(s) in use. Run without --dry to free them.`);
} else {
  console.log(`\nFreed ${killed}/${found}.`);
}
