/**
 * Domain logic for UGC Tracker: platforms, the pipeline state machine, the
 * poll schedule, and metric math. Pure functions only, no I/O, so it's shared
 * by server code, client components and unit tests.
 */

// ── Platforms ────────────────────────────────────────────────────────────────

export const PLATFORMS = ["youtube", "tiktok", "instagram", "facebook"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};

export interface ParsedVideoUrl {
  platform: Platform;
  /** Platform-native id when the URL carries one; null for short links that need resolving. */
  externalId: string | null;
  /** Normalized https URL handed to the stats provider. */
  url: string;
}

/**
 * Detect the platform (and the video id where the URL exposes it) from a
 * posted-video URL. Returns null for anything that isn't one of the four
 * supported platforms.
 */
export function parseVideoUrl(raw: string): ParsedVideoUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const url = u.toString();

  if (host === "youtu.be") return { platform: "youtube", externalId: parts[0] ?? null, url };
  if (host === "youtube.com" || host === "music.youtube.com") {
    const id =
      u.searchParams.get("v") ?? (["shorts", "live", "embed"].includes(parts[0] ?? "") ? (parts[1] ?? null) : null);
    return { platform: "youtube", externalId: id, url };
  }

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    // tiktok.com/@handle/video/<id> — vm./vt. short links carry no id until resolved.
    const i = parts.indexOf("video");
    return { platform: "tiktok", externalId: i >= 0 ? (parts[i + 1] ?? null) : null, url };
  }

  if (host === "instagram.com" || host === "instagr.am") {
    // instagram.com/p/<code>, /reel/<code>, /reels/<code>, /tv/<code>
    const i = parts.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p));
    return { platform: "instagram", externalId: i >= 0 ? (parts[i + 1] ?? null) : null, url };
  }

  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") {
    const id =
      u.searchParams.get("v") ??
      u.searchParams.get("story_fbid") ??
      (() => {
        const i = parts.findIndex((p) => ["videos", "reel", "reels", "posts"].includes(p));
        return i >= 0 ? (parts[i + 1] ?? null) : null;
      })();
    return { platform: "facebook", externalId: id, url };
  }

  return null;
}

// ── Pipeline state machine ───────────────────────────────────────────────────

export const PIPELINE_STATES = [
  "briefed",
  "draft_submitted",
  "in_review",
  "changes_requested",
  "approved",
  "posted",
  "paid",
] as const;
export type PipelineState = (typeof PIPELINE_STATES)[number];

export const PIPELINE_LABELS: Record<PipelineState, string> = {
  briefed: "Briefed",
  draft_submitted: "Draft submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  posted: "Posted",
  paid: "Paid",
};

/** Legal next states. `changes_requested` loops back to a new draft. */
export const PIPELINE_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  briefed: ["draft_submitted"],
  draft_submitted: ["in_review"],
  in_review: ["changes_requested", "approved"],
  changes_requested: ["draft_submitted"],
  approved: ["posted"],
  posted: ["paid"],
  paid: [],
};

export function canTransition(from: PipelineState, to: PipelineState): boolean {
  return PIPELINE_TRANSITIONS[from].includes(to);
}

/** Turnaround from brief to posted, in days — null until both stamps exist. */
export function turnaroundDays(video: Pick<Video, "stateHistory">): number | null {
  const briefed = video.stateHistory.find((h) => h.state === "briefed");
  const posted = video.stateHistory.find((h) => h.state === "posted");
  if (!briefed || !posted) return null;
  return (new Date(posted.at).getTime() - new Date(briefed.at).getTime()) / 86_400_000;
}

// ── Performance state ────────────────────────────────────────────────────────

export const PERFORMANCE_STATES = ["warming_up", "breaking_out", "steady", "stalled"] as const;
export type PerformanceState = (typeof PERFORMANCE_STATES)[number];

export const PERFORMANCE_LABELS: Record<PerformanceState, string> = {
  warming_up: "Warming up",
  breaking_out: "Breaking out",
  steady: "Steady",
  stalled: "Stalled",
};

// ── Documents ────────────────────────────────────────────────────────────────

export interface Creator {
  id: string;
  name: string;
  /** Handles per platform, without the leading @. */
  handles: Partial<Record<Platform, string>>;
  /** Default rate per video, in USD — prefilled as a new video's cost. */
  rateUsd: number | null;
  contractNotes: string;
  /** Follower/subscriber counts per platform, from the profile at add time. */
  followers: Partial<Record<Platform, number>>;
  createdAt: string;
}

export interface Metrics {
  views: number;
  likes: number;
  comments: number;
  shares: number | null;
  saves: number | null;
}

export interface Snapshot extends Metrics {
  id: string;
  videoId: string;
  capturedAt: string;
  source: "scraper" | "manual";
}

export interface Video {
  id: string;
  creatorId: string;
  title: string;
  platform: Platform | null;
  url: string | null;
  externalId: string | null;
  costUsd: number | null;
  pipelineState: PipelineState;
  /** Every state entered, oldest first — the source for turnaround metrics. */
  stateHistory: { state: PipelineState; at: string }[];
  postedAt: string | null;
  /** Caption/description from the platform — gives the digest something to reason about. */
  caption: string | null;

  // Derived from snapshots (recomputed on every new snapshot):
  latest: Metrics | null;
  performanceState: PerformanceState | null;
  /** Views gained per hour over the trailing ~24h window. */
  velocity: number | null;
  /** Views at the first snapshot ≥24h after posting — the team-wide hit predictor. */
  views24h: number | null;
  lastPolledAt: string | null;
  lastPollError: string | null;
  nextPollAt: string | null;
  trackingStatus: "idle" | "tracking" | "done";

  createdAt: string;
  updatedAt: string;
}

export interface DigestContent {
  headline: string;
  topPerformers: { videoId: string; title: string; why: string }[];
  needsAttention: { videoId: string; title: string; issue: string }[];
  creatorComparison: { creator: string; summary: string }[];
  patterns: string[];
  recommendations: string[];
}

export interface Digest {
  id: string;
  /** "ai" when Claude wrote it, "summary" when built from the numbers alone. */
  source: "ai" | "summary" | null;
  periodStart: string;
  periodEnd: string;
  status: "generating" | "ready" | "failed";
  trigger: "schedule" | "manual";
  content: DigestContent | null;
  error: string | null;
  model: string | null;
  videoCount: number;
  createdAt: string;
}

// ── Poll schedule ────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Stop polling 30 days after posting. */
export const TRACKING_WINDOW_MS = 30 * DAY;

/**
 * Decaying cadence keyed off time since posting: every 15 min for the first 6h,
 * hourly through day 3, daily through day 30, then stop (null).
 */
export function pollDelayMs(ageMs: number): number | null {
  if (ageMs < 6 * HOUR) return 15 * MINUTE;
  if (ageMs < 3 * DAY) return HOUR;
  if (ageMs < TRACKING_WINDOW_MS) return DAY;
  return null;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface DerivedMetrics {
  engagementRate: number | null;
  shareRate: number | null;
  saveRate: number | null;
  /** Cost per 1,000 views, USD. */
  cpm: number | null;
}

export function deriveMetrics(latest: Metrics | null, costUsd: number | null): DerivedMetrics {
  if (!latest || latest.views <= 0) {
    return { engagementRate: null, shareRate: null, saveRate: null, cpm: null };
  }
  const v = latest.views;
  const interactions = latest.likes + latest.comments + (latest.shares ?? 0) + (latest.saves ?? 0);
  return {
    engagementRate: interactions / v,
    shareRate: latest.shares == null ? null : latest.shares / v,
    saveRate: latest.saves == null ? null : latest.saves / v,
    cpm: costUsd == null ? null : (costUsd / v) * 1000,
  };
}

/**
 * Views gained per hour over the trailing ~24h: compares the latest snapshot
 * with the newest one at least 24h older (or the oldest available, for a
 * video younger than a day). Snapshots must be sorted by capturedAt ascending.
 */
export function trailingVelocity(snapshots: Pick<Snapshot, "capturedAt" | "views">[]): number | null {
  if (snapshots.length < 2) return null;
  const last = snapshots[snapshots.length - 1];
  const lastT = new Date(last.capturedAt).getTime();
  let base = snapshots[0];
  for (const s of snapshots) {
    if (lastT - new Date(s.capturedAt).getTime() >= DAY) base = s;
    else break;
  }
  const hours = (lastT - new Date(base.capturedAt).getTime()) / HOUR;
  if (hours <= 0) return null;
  return Math.max(0, last.views - base.views) / hours;
}

/** Views at the first snapshot taken ≥24h after posting; null if none yet. */
export function viewsAt24h(
  snapshots: Pick<Snapshot, "capturedAt" | "views">[],
  postedAt: string | null,
): number | null {
  if (!postedAt) return null;
  const cutoff = new Date(postedAt).getTime() + DAY;
  const s = snapshots.find((x) => new Date(x.capturedAt).getTime() >= cutoff);
  return s ? s.views : null;
}

/**
 * Team benchmark for a platform: median first-day views/hour across posted
 * videos that have a 24h reading. Needs ≥3 data points to mean anything.
 */
export function velocityBenchmark(views24hValues: number[]): number | null {
  if (views24hValues.length < 3) return null;
  const sorted = [...views24hValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median / 24;
}

/**
 * Classify a posted video. Breaking out wins over everything (a 2-hour-old
 * video beating the benchmark is the most useful signal on the board); then
 * the first 24h is warming up; after that a video that gained <1% of its
 * views in the last day is stalled.
 */
export function classifyPerformance(input: {
  postedAt: string | null;
  now: number;
  velocity: number | null;
  benchmark: number | null;
  totalViews: number | null;
}): PerformanceState | null {
  const { postedAt, now, velocity, benchmark, totalViews } = input;
  if (!postedAt || totalViews == null) return null;
  if (velocity != null && benchmark != null && benchmark > 0 && velocity >= benchmark * 1.5) {
    return "breaking_out";
  }
  const age = now - new Date(postedAt).getTime();
  if (age < DAY) return "warming_up";
  if (velocity == null) return "steady";
  const gainedLastDay = velocity * 24;
  if (gainedLastDay < Math.max(10, totalViews * 0.01)) return "stalled";
  return "steady";
}

// ── Bulk stats paste ─────────────────────────────────────────────────────────

/** "12,345", "12.3K", "1.2M", "4B" → integer; null if it isn't a count. */
export function parseCount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/,/g, "").toUpperCase();
  if (s === "" || s === "-" || s === "—") return null;
  const m = /^(\d+(?:\.\d+)?)\s*([KMB])?$/.exec(s);
  if (!m) return null;
  const mult = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "B" ? 1e9 : 1;
  return Math.round(Number(m[1]) * mult);
}

export type BulkLine =
  | { ok: true; line: number; url: string; parsed: ParsedVideoUrl; metrics: Metrics }
  | { ok: false; line: number; raw: string; error: string };

/**
 * Parse pasted rows of `url, views, likes, comments, shares, saves`. Tabs
 * (a spreadsheet paste) or commas both work; with commas, write counts
 * without thousands separators or use 12.3K. A header row is skipped.
 */
export function parseBulkStats(text: string): BulkLine[] {
  const out: BulkLine[] = [];
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
    const line = i + 1;
    if (i === 0 && !/^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(cells[0] ?? "")) return; // header
    const parsed = parseVideoUrl(cells[0] ?? "");
    if (!parsed) {
      out.push({ ok: false, line, raw, error: "First column isn't a YouTube, TikTok, Instagram or Facebook URL." });
      return;
    }
    const views = parseCount(cells[1]);
    if (views == null) {
      out.push({ ok: false, line, raw, error: "Views (2nd column) is missing or isn't a number." });
      return;
    }
    out.push({
      ok: true,
      line,
      url: cells[0],
      parsed,
      metrics: {
        views,
        likes: parseCount(cells[2]) ?? 0,
        comments: parseCount(cells[3]) ?? 0,
        shares: parseCount(cells[4]),
        saves: parseCount(cells[5]),
      },
    });
  });
  return out;
}

// ── Creator profile links ────────────────────────────────────────────────────

export interface ParsedProfile {
  platform: Platform;
  /** Handle without "@" (YouTube: the @handle, or a channel id starting with "UC"). */
  handle: string;
  url: string;
}

const RESERVED_PATHS = new Set(["p", "reel", "reels", "tv", "explore", "stories", "watch", "shorts", "video", "videos", "share", "groups", "profile.php"]);

/**
 * Read a creator profile from a pasted link (tiktok.com/@maya,
 * instagram.com/maya, youtube.com/@maya, facebook.com/maya) or a bare
 * "@handle" when `fallbackPlatform` says which platform it's on.
 */
export function parseProfileUrl(raw: string, fallbackPlatform: Platform | null = null): ParsedProfile | null {
  const input = raw.trim().replace(/[),.;]+$/, "");
  if (!input) return null;

  const bare = /^@?([A-Za-z0-9._-]{2,64})$/.exec(input);
  if (bare && (input.startsWith("@") || !input.includes("."))) {
    if (!fallbackPlatform) return null;
    const handle = bare[1];
    const urls: Record<Platform, string> = {
      tiktok: `https://www.tiktok.com/@${handle}`,
      instagram: `https://www.instagram.com/${handle}/`,
      youtube: `https://www.youtube.com/@${handle}`,
      facebook: `https://www.facebook.com/${handle}`,
    };
    return { platform: fallbackPlatform, handle, url: urls[fallbackPlatform] };
  }

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|mobile\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    if (!first.startsWith("@") || first.length < 2) return null;
    const handle = first.slice(1);
    return { platform: "tiktok", handle, url: `https://www.tiktok.com/@${handle}` };
  }
  if (host === "instagram.com") {
    if (!first || RESERVED_PATHS.has(first)) return null;
    return { platform: "instagram", handle: first, url: `https://www.instagram.com/${first}/` };
  }
  if (host === "youtube.com") {
    if (first.startsWith("@") && first.length > 1) {
      return { platform: "youtube", handle: first.slice(1), url: `https://www.youtube.com/${first}` };
    }
    if ((first === "channel" || first === "c" || first === "user") && parts[1]) {
      return { platform: "youtube", handle: parts[1], url: `https://www.youtube.com/${first}/${parts[1]}` };
    }
    return null;
  }
  if (host === "facebook.com" || host === "fb.com") {
    const id = first === "profile.php" ? u.searchParams.get("id") : first;
    if (!id || (first !== "profile.php" && RESERVED_PATHS.has(first))) return null;
    return { platform: "facebook", handle: id, url: first === "profile.php" ? `https://www.facebook.com/profile.php?id=${id}` : `https://www.facebook.com/${id}` };
  }
  return null;
}
