# Calla

Random video and text chat with strangers — an Omegle-style platform built to
stay cheap under load, self-hosted end to end, and indexable.

---

## The idea in one paragraph

Once two browsers have been introduced to each other, **the server drops out of
the conversation entirely**. Video, audio *and text* all travel peer-to-peer over
WebRTC. A matched pair costs us one idle WebSocket each plus roughly 10 KB of
signalling, and then nothing at all for the rest of the call.

The text part is the detail most clones miss. They pipe chat through Socket.IO
and then wonder why the box falls over at a few hundred concurrent users. Here
chat rides an `RTCDataChannel`, which is why it's free to run — and, as a side
effect, why there is no message history to leak, sell, or be compelled to hand
over. We couldn't produce one if we wanted to.

---

## Quick start

```bash
pnpm install
cp .env.example .env          # adjust ports if 5432/6379 are taken
pnpm infra:up                 # postgres, redis, coturn
pnpm db:migrate && pnpm db:seed
node scripts/fetch-nsfw-model.mjs   # optional: vendors the NSFW weights
pnpm dev
```

- Web → http://localhost:3100
- Signalling → ws://localhost:3001/ws (health at `/health`, metrics at `/metrics`)
- Component styleguide → http://localhost:3100/design (dev only)

**Requires Node 22+.** `uWebSockets.js` publishes prebuilt binaries only for Node
22/24/26, so `.npmrc` pins `use-node-version=22.20.0` — pnpm bundles its own
Node 20 and would otherwise fail to load the signalling server.

### Verify it works

```bash
pnpm --filter @callme/signal run smoke
```

Drives two independent clients through the full path — guest session → WS ticket
→ authentication → simultaneous queue join → match → two-phase ACK → signal relay
→ skip. It deliberately has both clients join in the same instant, because that
race is what the atomic matchmaker exists to make safe.

For the media itself you need two real browsers: open http://localhost:3100/chat
in a normal window and an incognito window (they need separate sessions), and
append `?relay=1` to force traffic through TURN and confirm the relay path works.

### Testing on a phone

Just browse to `http://<your-lan-ip>:3100` on a device on the same wifi. Nothing
to configure — the ticket endpoint rewrites a `localhost` signalling URL to the
host the browser actually used, and the signalling server accepts private-network
origins in development.

Two caveats that are properties of the web platform, not of this project:

- **Camera and microphone need a secure context.** Browsers only expose
  `getUserMedia` over HTTPS or on `localhost`, so a plain `http://192.168.x.x`
  page can load and match but cannot open the camera. Text mode works fine. For
  real video testing on a device, put it behind HTTPS — a tunnel, or Caddy with
  a local certificate.
- **Session cookies are not marked `Secure` over plain HTTP**, by design: a
  `Secure` cookie sent over HTTP is silently discarded by the browser, which
  would break the session on every device except the one running the server
  (browsers treat `localhost` as a secure context). The flag follows the actual
  transport, so it is still set behind Caddy in production.

---

## Layout

```
apps/web        Next.js — marketing, SEO pages, auth, chat client
apps/signal     uWebSockets.js — signalling and matchmaking
packages/ui     Design system: tokens + primitives
packages/db     Drizzle schema, migrations, shared queries
packages/protocol  Zod-validated wire protocol, shared by both apps
infra/          compose, Dockerfiles, coturn, Caddy
```

---

## How the pieces fit

### Matchmaking is one atomic Lua script

`apps/signal/src/lua/matchmake.lua` either commits a pair or enqueues the caller,
with no observable state in between. The obvious alternative — read the queue,
pick a partner, remove them — has a fatal race: two nodes can read the same
candidate in the gap before the removal, and both believe they own them. The
victim gets two simultaneous matches and one peer waits forever on an offer that
never arrives.

Matching starts strict and relaxes: shared interest → shared language →
anyone. A niche interest costs a few extra seconds, never an infinite wait.
Tier constraints are checked **symmetrically**, so a newcomer can't yank a picky
user out of their interest window.

Queue length is inversely related to load, which is what makes the bounded scan
cheap: at peak nobody is queued long enough to scan.

### WebRTC

- **Perfect negotiation** with the polite/impolite role assigned server-side, so
  both peers always agree on who yields during offer glare.
- **The camera is acquired once** and its tracks are reattached to each new peer
  connection. Calling `getUserMedia` per match blinks the hardware camera light
  at every "next", which on a product whose core loop *is* skipping is the most
  noticeable jank there is.
- **Relay-aware bitrate.** `getStats()` reports the selected candidate pair; if
  it's a `relay`, outbound video is capped to ~500 kbps. TURN bandwidth is the
  only per-byte cost in the whole system, and this cuts it by roughly 70% on the
  calls that actually use it while leaving direct calls at full quality.

### TURN is the only thing that costs real money

STUN resolves most connections for the price of one UDP round trip. TURN relays
the rest, and every byte crosses our box. Defences, in `infra/coturn/turnserver.conf`:
time-limited HMAC credentials (open TURN servers get scraped and turned into
someone's free proxy within days), hard per-user and aggregate quotas, and denied
peer ranges so the relay can't be used to pivot into the host network.

### Moderation

The explicit-content classifier runs **in the viewer's own browser**, in a Web
Worker, on a downscaled still every three seconds. Nothing is uploaded, so it
costs the server nothing. It needs two consecutive detections before blurring —
acting on a single frame flags innocent people constantly, and a safety feature
users learn to distrust is worse than none.

Bans apply to account, device and IP together, and are cached in Redis so the
check on every queue-join is O(1) rather than a Postgres round trip on the
hottest path in the system. A guest who signs up is an `UPDATE`, not an
`INSERT` — otherwise "create an account" would be a one-click reputation wash.

### SEO

The chat surface is `noindex` — it's per-user, ephemeral, and has nothing a
crawler could rank. Traffic comes from a static layer around it: ~110 prerendered
pages across country, interest and competitor-comparison routes, with JSON-LD,
canonicals and a generated sitemap. Unknown slugs 404 rather than generating on
demand, because an open-ended URL space is how programmatic sites accumulate the
thin pages that drag down a whole domain.

Landing page first-load JS is **116 kB**, of which 102 kB is the React 19 +
App Router baseline. Toast and tooltip providers are mounted in the chat route
rather than the root layout so their bundles never reach a marketing page.

---

## Commands

| | |
|---|---|
| `pnpm dev` | Web + signalling with hot reload |
| `pnpm dev:fresh` | Free stale ports first, then `dev` |
| `pnpm ports` | Show what's holding this project's ports |
| `pnpm ports:free` | Kill stale listeners on those ports |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm start` | Run the production build (web :3100, signal :3001) |
| `pnpm infra:up` / `infra:down` | Datastores + coturn |
| `pnpm infra:prod` | Full stack in Docker, including web + signal |
| `pnpm db:generate` | New migration from schema changes |
| `pnpm db:migrate` / `db:seed` | Apply migrations / seed interests |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm --filter @callme/signal run smoke` | End-to-end matchmaking test |
| `pnpm --filter @callme/web run auth-check` | Auth primitives (hashing, recovery codes) |

Configuration is a single `.env` at the repository root; every entry point walks
up to find it, so there is no per-package copy to drift out of sync.

`ports:free` derives its target list from that same `.env` — the web port from
`NEXT_PUBLIC_SITE_URL`, the signalling port from `SIGNAL_PORT`. It will never
touch a port this project isn't configured to use, so an unrelated service of
yours on another port is not at risk, and it names every process before killing
it. Use `pnpm ports` first if you want to look without touching anything.

---

## Deploying

```bash
pnpm infra:prod
```

Set `SESSION_SECRET` and `TURN_SECRET` to real values first — compose refuses to
start without them. Use the `pnpm` scripts rather than bare `docker compose`
commands: Compose resolves a bare `.env` relative to the compose file
(`infra/`), not the repository root where ours lives, so it needs the
`--env-file .env` the scripts pass. `TURN_SECRET` must match `static-auth-secret` in
`turnserver.conf`, and coturn needs `external-ip` set when it sits behind cloud
NAT.

Scale signalling with `--scale signal=3`. Nodes coordinate through Redis pub/sub
and the matchmaker is atomic across all of them, so no sticky sessions are
required. On Linux, give coturn host networking and a much wider relay port
range than the dev default.

---

## Known gaps

Honest list of what is scaffolded but not finished:

- **Auth is built but only partly automated-tested.** `/signup`, `/login` and
  `/recover` work, and `pnpm --filter @callme/web run auth-check` covers the
  security-critical primitives (Argon2id cost, salting, recovery-code
  round-trip, enumeration resistance). The form submissions themselves are
  verified by render and typecheck, not by an end-to-end run — server actions
  are awkward to drive without a browser harness.
- **Moderator dashboard.** Reports, strikes, and automatic bans all work
  server-side. `/admin` doesn't exist yet, so review currently means querying
  the `reports` table.
- **`terms` and `privacy` are drafts** and say so on the page. They accurately
  describe what the software does. They have not been reviewed by a lawyer, and
  must be before any public launch.
- **The NSFW model is not vendored by default.** Run
  `node scripts/fetch-nsfw-model.mjs`. Without it the blur silently stays off;
  reporting is unaffected.
- **No i18n yet.** The SEO helper emits `hreflang` when given locales, but no
  translations exist.

### One thing worth saying plainly

Omegle shut down in November 2023 under litigation over child abuse on the
platform. Everything in this repo raises the cost of abusing the service and
shortens how long a bad actor lasts — requiring identity, device-level bans,
on-device detection, human review. None of it is a guarantee. Get real legal
review, and staff the report queue before you open the doors.
