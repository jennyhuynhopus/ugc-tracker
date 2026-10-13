// Runs UGC Tracker entirely on this machine: an embedded Postgres (PGlite)
// saved in ./.localdb, the Next.js site, and the 15-minute stats check.
//   npm run local            → http://localhost:3200
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";

const DB_PORT = Number(process.env.LOCAL_DB_PORT) || 55433;
const DB_DIR = process.env.LOCAL_DB_DIR || "./.localdb";
const APP_PORT = Number(process.env.PORT) || 3200;
const TICK_MS = 15 * 60 * 1000;

// Local-only settings live in .env.local (gitignored). Keep what's there,
// add a cron secret once if it's missing.
const envFile = ".env.local";
let env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
if (!/^CRON_SECRET=/m.test(env)) {
  env += `${env && !env.endsWith("\n") ? "\n" : ""}CRON_SECRET=${randomBytes(24).toString("hex")}\n`;
  writeFileSync(envFile, env, { mode: 0o600 });
}
const cronSecret = env.match(/^CRON_SECRET=(.+)$/m)[1].trim();

async function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}
if (!(await portFree(DB_PORT))) {
  console.error(`Port ${DB_PORT} is busy. Is UGC Tracker already running in another tab?`);
  process.exit(1);
}

const db = await PGlite.create(DB_DIR);
const server = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 4 });
await server.start();
console.log(`✓ Database ready (saved in ${DB_DIR})`);

const app = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
    // PGlite is a single session: one connection keeps queries from interleaving.
    DATABASE_POOL_MAX: "1",
    // Trust the Mac's certificate store too, so HTTPS works behind company
    // VPNs that inspect traffic (otherwise: SELF_SIGNED_CERT_IN_CHAIN).
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --use-system-ca`.trim(),
  },
});

// A fresh database starts with the team's creators from data/creators.json.
// Their recent videos are pulled on the first stats check below.
async function loadCreatorsIfEmpty() {
  if (!existsSync("data/creators.json")) return;
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`http://localhost:${APP_PORT}/settings`).then((r) => r.ok).catch(() => false);
    if (ok) break; // the app creates the tables on its first request
    await new Promise((r) => setTimeout(r, 2000));
  }
  const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const [{ n }] = await sql`select count(*)::int as n from creators`;
    if (n > 0) return;
    const creators = JSON.parse(readFileSync("data/creators.json", "utf8"));
    for (const c of creators) {
      await sql`
        insert into creators (name, handles, followers, rate_usd, contract_notes)
        values (${c.name}, ${sql.json(c.handles ?? {})}, ${sql.json(c.followers ?? {})}, ${c.rateUsd ?? null}, ${c.notes ?? ""})`;
    }
    console.log(`✓ Loaded ${creators.length} creators from data/creators.json`);
  } catch (err) {
    console.error("Couldn't load data/creators.json:", err.message);
  } finally {
    await sql.end();
  }
}

async function tick() {
  try {
    const res = await fetch(`http://localhost:${APP_PORT}/api/cron/tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await res.json().catch(() => ({}));
    if (body.ok) console.log(`↻ Stats check: ${body.polled} polled, ${body.errors} errors${body.digest ? ", weekly digest written" : ""}`);
  } catch {
    // Site still starting; the next tick will catch up.
  }
}
loadCreatorsIfEmpty().then(() => setTimeout(tick, 5_000));
const timer = setInterval(tick, TICK_MS);

const stop = async () => {
  clearInterval(timer);
  app.kill("SIGINT");
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", stop);
console.log(`→ Opening on http://localhost:${APP_PORT} (Ctrl+C to stop)`);
