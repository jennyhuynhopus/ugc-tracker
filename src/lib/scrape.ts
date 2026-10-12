/**
 * Public video stats via ScrapeCreators — one API key covers all four
 * platforms, so creators never have to OAuth into anything.
 *
 * Endpoint + field paths are from https://docs.scrapecreators.com/openapi.json.
 * Every metric is read as optional: platforms omit fields (Instagram and
 * YouTube expose no shares/saves; Facebook can return a null view_count).
 */
import type { Metrics, Platform } from "./domain";

const BASE_URL = "https://api.scrapecreators.com";

const ENDPOINTS: Record<Platform, string> = {
  tiktok: "/v2/tiktok/video",
  instagram: "/v1/instagram/post",
  youtube: "/v1/youtube/video",
  facebook: "/v1/facebook/post",
};

export interface FetchedStats {
  metrics: Metrics;
  caption: string | null;
  publishedAt: string | null;
}

/** A failure retrying won't fix (missing key, out of credits, bad URL). */
export class PermanentScrapeError extends Error {
  name = "PermanentScrapeError";
}

type Json = Record<string, unknown>;

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(key)] : (cur as Json)[key];
  }
  return cur;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function isoFromUnix(v: unknown): string | null {
  const n = num(v);
  return n == null ? null : new Date(n * 1000).toISOString();
}

function isoFromString(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parse(platform: Platform, body: Json): FetchedStats {
  switch (platform) {
    case "tiktok": {
      const s = "aweme_detail.statistics";
      return {
        metrics: {
          views: num(at(body, `${s}.play_count`)) ?? 0,
          likes: num(at(body, `${s}.digg_count`)) ?? 0,
          comments: num(at(body, `${s}.comment_count`)) ?? 0,
          shares: num(at(body, `${s}.share_count`)),
          saves: num(at(body, `${s}.collect_count`)),
        },
        caption: str(at(body, "aweme_detail.desc")),
        publishedAt: isoFromUnix(at(body, "aweme_detail.create_time")),
      };
    }
    case "instagram": {
      const m = "data.xdt_shortcode_media";
      return {
        metrics: {
          views: num(at(body, `${m}.video_play_count`)) ?? num(at(body, `${m}.video_view_count`)) ?? 0,
          likes: num(at(body, `${m}.edge_media_preview_like.count`)) ?? 0,
          comments: num(at(body, `${m}.edge_media_to_parent_comment.count`)) ?? 0,
          shares: null,
          saves: null,
        },
        caption: str(at(body, `${m}.edge_media_to_caption.edges.0.node.text`)),
        publishedAt: isoFromUnix(at(body, `${m}.taken_at_timestamp`)),
      };
    }
    case "youtube": {
      const title = str(body.title);
      const description = str(body.description);
      return {
        metrics: {
          views: num(body.viewCountInt) ?? 0,
          likes: num(body.likeCountInt) ?? 0,
          comments: num(body.commentCountInt) ?? 0,
          shares: null,
          saves: null,
        },
        caption: [title, description].filter(Boolean).join("\n\n") || null,
        publishedAt: isoFromString(body.publishDate),
      };
    }
    case "facebook":
      return {
        metrics: {
          views: num(body.view_count) ?? 0,
          likes: num(body.like_count) ?? 0,
          comments: num(body.comment_count) ?? 0,
          shares: num(body.share_count),
          saves: null,
        },
        caption: str(body.description),
        publishedAt: isoFromString(body.creation_time),
      };
  }
}

/**
 * Fetch current stats. YouTube goes through the free official Data API when
 * YOUTUBE_API_KEY is set; everything else (and YouTube without that key) goes
 * through ScrapeCreators.
 */
export async function fetchStats(
  platform: Platform,
  url: string,
  externalId: string | null = null,
): Promise<FetchedStats> {
  if (platform === "youtube" && process.env.YOUTUBE_API_KEY && externalId) {
    return fetchYouTubeOfficial(externalId, process.env.YOUTUBE_API_KEY);
  }
  return fetchScrapeCreators(platform, url);
}

/**
 * YouTube Data API v3 `videos.list` — 1 quota unit per call against a free
 * 10,000/day quota, so even 500 videos on the 15-minute cadence fits easily.
 */
async function fetchYouTubeOfficial(videoId: string, apiKey: string): Promise<FetchedStats> {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "statistics,snippet");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("key", apiKey);
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as Json;
    const reason = str(at(body, "error.message")) ?? `HTTP ${res.status}`;
    // quotaExceeded is a 403 too, and it resets daily — retrying now won't help.
    throw new PermanentScrapeError(`YouTube Data API rejected the request: ${reason}`);
  }
  if (!res.ok) throw new Error(`YouTube Data API HTTP ${res.status}`);
  const body = (await res.json()) as Json;
  const item = at(body, "items.0");
  if (!item) throw new PermanentScrapeError("YouTube couldn't find this video. It may be private or deleted.");
  const title = str(at(item, "snippet.title"));
  const description = str(at(item, "snippet.description"));
  return {
    metrics: {
      views: num(at(item, "statistics.viewCount")) ?? 0,
      likes: num(at(item, "statistics.likeCount")) ?? 0,
      comments: num(at(item, "statistics.commentCount")) ?? 0,
      shares: null,
      saves: null,
    },
    caption: [title, description].filter(Boolean).join("\n\n") || null,
    publishedAt: isoFromString(at(item, "snippet.publishedAt")),
  };
}

async function fetchScrapeCreators(platform: Platform, url: string): Promise<FetchedStats> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    throw new PermanentScrapeError(
      platform === "youtube"
        ? "No stats key set. Add YOUTUBE_API_KEY (free) or SCRAPECREATORS_API_KEY to your environment variables, or log stats manually."
        : "SCRAPECREATORS_API_KEY isn't set. Add it to your environment variables, or log stats manually.",
    );
  }
  const endpoint = new URL(ENDPOINTS[platform], BASE_URL);
  endpoint.searchParams.set("url", url);

  const res = await fetch(endpoint, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 402) throw new PermanentScrapeError("ScrapeCreators is out of credits.");
  if (res.status === 401 || res.status === 403) {
    throw new PermanentScrapeError(
      `ScrapeCreators rejected the request (HTTP ${res.status}). Check the API key, or the video may be private or age-restricted.`,
    );
  }
  if (res.status === 400 || res.status === 404) {
    throw new PermanentScrapeError(`ScrapeCreators couldn't find this video (HTTP ${res.status}). Check the URL.`);
  }
  if (!res.ok) throw new Error(`ScrapeCreators HTTP ${res.status}`);

  const body = (await res.json()) as Json;
  if (body.success === false) {
    throw new Error(`ScrapeCreators returned success=false: ${str(body.message) ?? "no message"}`);
  }
  return parse(platform, body);
}

// ── Creator profiles ─────────────────────────────────────────────────────────

export interface FetchedProfile {
  name: string | null;
  followers: number | null;
}

/** Display name + follower count for a profile. Costs one ScrapeCreators credit. */
export async function fetchProfile(platform: Platform, handle: string, url: string): Promise<FetchedProfile> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new PermanentScrapeError("SCRAPECREATORS_API_KEY isn't set.");
  const endpoint = new URL(
    { tiktok: "/v1/tiktok/profile", instagram: "/v1/instagram/profile", youtube: "/v1/youtube/channel", facebook: "/v1/facebook/profile" }[platform],
    BASE_URL,
  );
  if (platform === "tiktok" || platform === "instagram") endpoint.searchParams.set("handle", handle);
  else if (platform === "youtube") {
    if (/^UC[\w-]{10,}$/.test(handle)) endpoint.searchParams.set("channelId", handle);
    else endpoint.searchParams.set("handle", handle);
  } else endpoint.searchParams.set("url", url);

  const res = await fetch(endpoint, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 402) throw new PermanentScrapeError("ScrapeCreators is out of credits.");
  if (!res.ok) throw new PermanentScrapeError(`Couldn't find that profile (HTTP ${res.status}).`);
  const body = (await res.json()) as Json;
  switch (platform) {
    case "tiktok":
      return { name: str(at(body, "user.nickname")), followers: num(at(body, "stats.followerCount")) };
    case "instagram":
      return { name: str(at(body, "data.user.full_name")), followers: num(at(body, "data.user.edge_followed_by.count")) };
    case "youtube":
      return { name: str(body.name), followers: num(body.subscriberCount) };
    case "facebook":
      return { name: str(body.name), followers: num(body.followerCount) };
  }
}

// ── A profile's recent videos ────────────────────────────────────────────────

export interface ListedVideo {
  externalId: string;
  url: string;
  caption: string | null;
  publishedAt: string | null;
  metrics: Metrics;
}

async function getJson(path: string, params: Record<string, string>): Promise<Json> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new PermanentScrapeError("SCRAPECREATORS_API_KEY isn't set.");
  const endpoint = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) endpoint.searchParams.set(k, v);
  const res = await fetch(endpoint, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(45_000) });
  if (res.status === 402) throw new PermanentScrapeError("ScrapeCreators is out of credits.");
  if (res.status === 401 || res.status === 403) throw new PermanentScrapeError(`ScrapeCreators rejected the request (HTTP ${res.status}).`);
  if (res.status === 400 || res.status === 404) throw new PermanentScrapeError(`Profile not found (HTTP ${res.status}).`);
  if (!res.ok) throw new Error(`ScrapeCreators HTTP ${res.status}`);
  return (await res.json()) as Json;
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * The profile's most recent videos with current stats (one page, newest
 * first). One credit per call; YouTube makes two (Shorts + long-form).
 */
export async function fetchProfileVideos(platform: Platform, handle: string, profileUrl: string): Promise<ListedVideo[]> {
  const ytParam: Record<string, string> = /^UC[\w-]{10,}$/.test(handle) ? { channelId: handle } : { handle };
  switch (platform) {
    case "tiktok": {
      const body = await getJson("/v3/tiktok/profile/videos", { handle, sort_by: "latest" });
      return list(body.aweme_list).map((v) => ({
        externalId: String(at(v, "aweme_id")),
        url: str(at(v, "url")) ?? `https://www.tiktok.com/@${handle}/video/${at(v, "aweme_id")}`,
        caption: str(at(v, "desc")),
        publishedAt: isoFromUnix(at(v, "create_time")),
        metrics: {
          views: num(at(v, "statistics.play_count")) ?? 0,
          likes: num(at(v, "statistics.digg_count")) ?? 0,
          comments: num(at(v, "statistics.comment_count")) ?? 0,
          shares: num(at(v, "statistics.share_count")),
          saves: num(at(v, "statistics.collect_count")),
        },
      }));
    }
    case "instagram": {
      const body = await getJson("/v1/instagram/user/reels", { handle });
      // Live responses wrap each reel in { media: {...} }; the docs' example doesn't.
      return list(body.items).map((item) => {
        const v = (at(item, "media") as Json | undefined) ?? item;
        const code = str(at(v, "code")) ?? String(at(v, "id"));
        return {
          externalId: code,
          url: str(at(v, "url")) ?? `https://www.instagram.com/reel/${code}/`,
          caption: str(at(v, "caption.text")),
          publishedAt: isoFromUnix(at(v, "taken_at")),
          metrics: {
            views: num(at(v, "play_count")) ?? num(at(v, "ig_play_count")) ?? 0,
            likes: num(at(v, "like_count")) ?? 0,
            comments: num(at(v, "comment_count")) ?? 0,
            shares: null,
            saves: null,
          },
        };
      });
    }
    case "youtube": {
      const [shorts, videos] = await Promise.all([
        getJson("/v1/youtube/channel/shorts", { ...ytParam, sort: "newest" }),
        getJson("/v1/youtube/channel-videos", { ...ytParam, sort: "latest" }),
      ]);
      const toVideo = (v: unknown, dateKey: string): ListedVideo => ({
        externalId: String(at(v, "id")),
        url: str(at(v, "url")) ?? `https://www.youtube.com/watch?v=${at(v, "id")}`,
        caption: str(at(v, "title")),
        publishedAt: isoFromString(at(v, dateKey)),
        metrics: { views: num(at(v, "viewCountInt")) ?? 0, likes: 0, comments: 0, shares: null, saves: null },
      });
      return [...list(shorts.shorts).map((v) => toVideo(v, "publishDate")), ...list(videos.videos).map((v) => toVideo(v, "publishedTime"))];
    }
    case "facebook": {
      const body = await getJson("/v1/facebook/profile/reels", { url: profileUrl });
      return list(body.reels).map((v) => {
        const url = str(at(v, "url")) ?? "";
        return {
          externalId: url.match(/\/reel\/(\d+)/)?.[1] ?? String(at(v, "id")),
          url,
          caption: str(at(v, "description")),
          publishedAt: isoFromString(at(v, "creation_time")),
          metrics: { views: num(at(v, "view_count")) ?? 0, likes: 0, comments: 0, shares: null, saves: null },
        };
      });
    }
  }
}
