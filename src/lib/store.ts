import type { JSONValue } from "postgres";
import { db, iso } from "./db";
import {
  type Creator,
  classifyPerformance,
  type Digest,
  type Metrics,
  type Platform,
  type Snapshot,
  trailingVelocity,
  type Video,
  velocityBenchmark,
  viewsAt24h,
} from "./domain";

type Row = Record<string, unknown>;

/** Typed values → jsonb parameter. */
const asJson = (v: unknown) => v as JSONValue;

// ── Row mapping (Postgres Date objects → ISO strings the UI expects) ─────────

function toCreator(r: Row): Creator {
  return {
    id: r.id as string,
    name: r.name as string,
    handles: (r.handles as Creator["handles"]) ?? {},
    rateUsd: (r.rateUsd as number | null) ?? null,
    contractNotes: (r.contractNotes as string) ?? "",
    createdAt: iso(r.createdAt as Date) as string,
  };
}

function toVideo(r: Row): Video {
  return {
    id: r.id as string,
    creatorId: r.creatorId as string,
    title: r.title as string,
    platform: (r.platform as Platform | null) ?? null,
    url: (r.url as string | null) ?? null,
    externalId: (r.externalId as string | null) ?? null,
    costUsd: (r.costUsd as number | null) ?? null,
    pipelineState: r.pipelineState as Video["pipelineState"],
    stateHistory: (r.stateHistory as Video["stateHistory"]) ?? [],
    postedAt: iso(r.postedAt as Date | null),
    caption: (r.caption as string | null) ?? null,
    latest: (r.latest as Metrics | null) ?? null,
    performanceState: (r.performanceState as Video["performanceState"]) ?? null,
    velocity: (r.velocity as number | null) ?? null,
    views24h: (r.views24h as number | null) ?? null,
    lastPolledAt: iso(r.lastPolledAt as Date | null),
    lastPollError: (r.lastPollError as string | null) ?? null,
    nextPollAt: iso(r.nextPollAt as Date | null),
    trackingStatus: (r.trackingStatus as Video["trackingStatus"]) ?? "idle",
    createdAt: iso(r.createdAt as Date) as string,
    updatedAt: iso(r.updatedAt as Date) as string,
  };
}

function toSnapshot(r: Row): Snapshot {
  return {
    id: String(r.id),
    videoId: r.videoId as string,
    capturedAt: iso(r.capturedAt as Date) as string,
    views: r.views as number,
    likes: r.likes as number,
    comments: r.comments as number,
    shares: (r.shares as number | null) ?? null,
    saves: (r.saves as number | null) ?? null,
    source: r.source as Snapshot["source"],
  };
}

function toDigest(r: Row): Digest {
  return {
    id: r.id as string,
    periodStart: iso(r.periodStart as Date) as string,
    periodEnd: iso(r.periodEnd as Date) as string,
    status: r.status as Digest["status"],
    trigger: r.trigger as Digest["trigger"],
    source: (r.source as Digest["source"]) ?? null,
    content: (r.content as Digest["content"]) ?? null,
    error: (r.error as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    videoCount: (r.videoCount as number) ?? 0,
    createdAt: iso(r.createdAt as Date) as string,
  };
}

// ── Creators ─────────────────────────────────────────────────────────────────

export async function listCreators(): Promise<Creator[]> {
  const sql = await db();
  return (await sql`select * from creators order by name`).map(toCreator);
}

export async function getCreator(id: string): Promise<Creator | null> {
  const sql = await db();
  const [r] = await sql`select * from creators where id = ${id}`;
  return r ? toCreator(r) : null;
}

export async function insertCreator(c: Omit<Creator, "id" | "createdAt">): Promise<void> {
  const sql = await db();
  await sql`
    insert into creators (name, handles, rate_usd, contract_notes)
    values (${c.name}, ${sql.json(asJson(c.handles))}, ${c.rateUsd}, ${c.contractNotes})`;
}

// ── Videos ───────────────────────────────────────────────────────────────────

export async function listVideos(): Promise<Video[]> {
  const sql = await db();
  return (await sql`select * from videos order by updated_at desc`).map(toVideo);
}

export async function getVideo(id: string): Promise<Video | null> {
  const sql = await db();
  const [r] = await sql`select * from videos where id = ${id}`;
  return r ? toVideo(r) : null;
}

export async function findVideoByUrl(platform: Platform, externalId: string | null, url: string): Promise<Video | null> {
  const sql = await db();
  const [r] = externalId
    ? await sql`select * from videos where platform = ${platform} and external_id = ${externalId} limit 1`
    : await sql`select * from videos where url = ${url} limit 1`;
  return r ? toVideo(r) : null;
}

export async function insertVideo(
  v: Pick<
    Video,
    "creatorId" | "title" | "platform" | "url" | "externalId" | "costUsd" | "pipelineState" | "stateHistory" | "postedAt"
  >,
): Promise<string> {
  const sql = await db();
  const [r] = await sql`
    insert into videos (creator_id, title, platform, url, external_id, cost_usd, pipeline_state, state_history, posted_at)
    values (${v.creatorId}, ${v.title}, ${v.platform}, ${v.url}, ${v.externalId}, ${v.costUsd},
            ${v.pipelineState}, ${sql.json(asJson(v.stateHistory))}, ${v.postedAt})
    returning id`;
  return r.id as string;
}

export async function transitionVideoState(id: string, to: Video["pipelineState"], postedAt: string | null): Promise<void> {
  const sql = await db();
  const entry = [{ state: to, at: new Date().toISOString() }];
  await sql`
    update videos set
      pipeline_state = ${to},
      state_history = state_history || ${sql.json(asJson(entry))},
      posted_at = coalesce(posted_at, ${postedAt}),
      updated_at = now()
    where id = ${id}`;
}

export async function updateVideoFields(
  id: string,
  f: Partial<Pick<Video, "title" | "costUsd" | "url" | "platform" | "externalId" | "postedAt">>,
): Promise<void> {
  const sql = await db();
  const cols: Row = { ...f, updatedAt: new Date() };
  await sql`update videos set ${sql(cols)} where id = ${id}`;
}

export async function deleteVideoById(id: string): Promise<void> {
  const sql = await db();
  await sql`delete from videos where id = ${id}`;
}

export async function setPollStatus(
  id: string,
  patch: Partial<Pick<Video, "lastPollError" | "nextPollAt" | "trackingStatus" | "postedAt">>,
): Promise<void> {
  const sql = await db();
  const cols: Row = { ...patch, updatedAt: new Date() };
  await sql`update videos set ${sql(cols)} where id = ${id}`;
}

/** Posted videos whose next poll is due, oldest-due first. */
export async function listDueVideoIds(limit: number): Promise<string[]> {
  const sql = await db();
  const rows = await sql`
    select id from videos
    where tracking_status = 'tracking' and (next_poll_at is null or next_poll_at <= now())
    order by next_poll_at nulls first
    limit ${limit}`;
  return rows.map((r) => r.id as string);
}

// ── Snapshots ────────────────────────────────────────────────────────────────

export async function listSnapshots(videoId: string): Promise<Snapshot[]> {
  const sql = await db();
  return (await sql`select * from snapshots where video_id = ${videoId} order by captured_at`).map(toSnapshot);
}

export async function listSnapshotsFor(videoIds: string[]): Promise<Snapshot[]> {
  if (videoIds.length === 0) return [];
  const sql = await db();
  return (await sql`select * from snapshots where video_id in ${sql(videoIds)} order by captured_at`).map(toSnapshot);
}

/** Median first-day velocity for a platform across all posted videos. */
async function platformBenchmark(platform: Platform): Promise<number | null> {
  const sql = await db();
  const rows = await sql`select views24h from videos where platform = ${platform} and views24h is not null`;
  return velocityBenchmark(rows.map((r) => r.views24h as number));
}

/**
 * Append a snapshot and recompute the video's derived fields (latest metrics,
 * velocity, 24h reading, performance state). The single write path for the
 * scheduled poller, manual entry and bulk paste, so they can't disagree.
 */
export async function recordSnapshot(
  videoId: string,
  m: Metrics,
  source: Snapshot["source"],
  extra: { caption?: string | null } = {},
): Promise<void> {
  const sql = await db();
  await sql`
    insert into snapshots (video_id, views, likes, comments, shares, saves, source)
    values (${videoId}, ${m.views}, ${m.likes}, ${m.comments}, ${m.shares}, ${m.saves}, ${source})`;

  const video = await getVideo(videoId);
  if (!video) return;
  const series = await listSnapshots(videoId);
  const latest = series[series.length - 1];
  const velocity = trailingVelocity(series);
  const views24h = video.views24h ?? viewsAt24h(series, video.postedAt);
  const benchmark = video.platform ? await platformBenchmark(video.platform) : null;
  const performanceState = classifyPerformance({
    postedAt: video.postedAt,
    now: Date.now(),
    velocity,
    benchmark,
    totalViews: latest.views,
  });

  const latestMetrics: Metrics = {
    views: latest.views,
    likes: latest.likes,
    comments: latest.comments,
    shares: latest.shares,
    saves: latest.saves,
  };
  await sql`
    update videos set
      latest = ${sql.json(asJson(latestMetrics))},
      velocity = ${velocity},
      views24h = ${views24h},
      performance_state = ${performanceState},
      caption = coalesce(caption, ${extra.caption ?? null}),
      last_polled_at = case when ${source} = 'scraper' then now() else last_polled_at end,
      last_poll_error = case when ${source} = 'scraper' then null else last_poll_error end,
      updated_at = now()
    where id = ${videoId}`;
}

// ── Digests ──────────────────────────────────────────────────────────────────

export async function listDigests(limit = 20): Promise<Digest[]> {
  const sql = await db();
  return (await sql`select * from digests order by created_at desc limit ${limit}`).map(toDigest);
}

export async function createDigest(d: Pick<Digest, "periodStart" | "periodEnd" | "trigger">): Promise<string> {
  const sql = await db();
  const [r] = await sql`
    insert into digests (period_start, period_end, status, trigger)
    values (${d.periodStart}, ${d.periodEnd}, 'generating', ${d.trigger})
    returning id`;
  return r.id as string;
}

export async function finishDigest(
  id: string,
  f: Pick<Digest, "status" | "source" | "content" | "error" | "model" | "videoCount">,
): Promise<void> {
  const sql = await db();
  await sql`
    update digests set
      status = ${f.status}, source = ${f.source}, content = ${f.content ? sql.json(asJson(f.content)) : null},
      error = ${f.error}, model = ${f.model}, video_count = ${f.videoCount}
    where id = ${id}`;
}

export async function lastScheduledDigestAt(): Promise<string | null> {
  const sql = await db();
  const [r] = await sql`select max(created_at) as at from digests where trigger = 'schedule'`;
  return iso(r?.at as Date | null);
}
