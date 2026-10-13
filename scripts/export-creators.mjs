// Writes the local database's creators to data/creators.json (names, handles,
// rates, notes, follower counts), the list the team site loads new creators
// from. Run while `npm run local` is running:  npm run export-creators
import { writeFileSync } from "node:fs";
import postgres from "postgres";

const port = Number(process.env.LOCAL_DB_PORT) || 55433;
const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { prepare: false, max: 1, onnotice: () => {} });
try {
  const rows = await sql`select name, handles, followers, rate_usd, contract_notes from creators order by created_at`;
  const creators = rows.map((r) => ({
    name: r.name,
    handles: r.handles,
    rateUsd: r.rate_usd,
    followers: r.followers,
    notes: r.contract_notes ?? "",
  }));
  writeFileSync("data/creators.json", `${JSON.stringify(creators, null, 2)}\n`);
  console.log(`✓ Wrote ${creators.length} creators to data/creators.json`);
} catch (err) {
  console.error("Couldn't read the local database. Is `npm run local` running?", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
