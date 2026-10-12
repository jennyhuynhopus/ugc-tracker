import postgres from "postgres";

/**
 * Postgres access. Works with any Postgres (Supabase, Neon, local). Tables
 * are created on first use, so a fresh database needs no manual setup.
 */

const SCHEMA = `
create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handles jsonb not null default '{}'::jsonb,
  rate_usd double precision,
  contract_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  title text not null,
  platform text,
  url text,
  external_id text,
  cost_usd double precision,
  pipeline_state text not null,
  state_history jsonb not null default '[]'::jsonb,
  posted_at timestamptz,
  caption text,
  latest jsonb,
  performance_state text,
  velocity double precision,
  views24h bigint,
  last_polled_at timestamptz,
  last_poll_error text,
  next_poll_at timestamptz,
  tracking_status text not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists videos_due_idx on videos (tracking_status, next_poll_at);
create index if not exists videos_platform_idx on videos (platform, external_id);

create table if not exists snapshots (
  id bigserial primary key,
  video_id uuid not null references videos(id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint not null,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint,
  saves bigint,
  source text not null
);
create index if not exists snapshots_video_idx on snapshots (video_id, captured_at);

create table if not exists digests (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null,
  trigger text not null,
  source text,
  content jsonb,
  error text,
  model text,
  video_count integer not null default 0,
  created_at timestamptz not null default now()
);
`;

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { ugcSql?: Sql; ugcReady?: Promise<Sql> | null };

function client(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL isn't set. Add your Supabase (or any Postgres) connection string.");
  globalForDb.ugcSql ??= postgres(url, {
    // Supabase's pooler (port 6543) runs in transaction mode, which can't hold
    // prepared statements across requests.
    prepare: false,
    // Override only for single-session test databases (e.g. PGlite): DATABASE_POOL_MAX=1.
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idle_timeout: 20,
    transform: postgres.camel,
    types: {
      // Counts are bigint in the schema; they fit comfortably in a JS number.
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  return globalForDb.ugcSql;
}

/** The ready-to-use client. Runs the idempotent schema once per process. */
export function db(): Promise<Sql> {
  globalForDb.ugcReady ??= (async () => {
    const sql = client();
    await sql.unsafe(SCHEMA);
    return sql;
  })().catch((err) => {
    // Don't cache a failure: the next request retries.
    globalForDb.ugcReady = null;
    throw err;
  });
  return globalForDb.ugcReady;
}

/** Dates come back as Date objects; the app passes ISO strings around. */
export function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
