"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateDigest } from "@/lib/digest";
import {
  type Creator,
  canTransition,
  PIPELINE_LABELS,
  PIPELINE_STATES,
  type PipelineState,
  PLATFORMS,
  parseBulkStats,
  parseVideoUrl,
} from "@/lib/domain";
import { startTracking } from "@/lib/poll";
import { installScheduler, removeScheduler } from "@/lib/scheduler";
import {
  deleteVideoById,
  findVideoByUrl,
  getCreator,
  getVideo,
  insertCreator,
  insertVideo,
  recordSnapshot,
  setPollStatus,
  transitionVideoState,
  updateVideoFields,
} from "@/lib/store";

export interface FormState {
  error: string | null;
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function money(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/[$,]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function count(form: FormData, key: string): number | null {
  const raw = text(form, key).replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** A failed first poll shouldn't block saving; the error shows on the video. */
async function tryStartTracking(videoId: string): Promise<void> {
  try {
    await startTracking(videoId);
  } catch (err) {
    await setPollStatus(videoId, { lastPollError: `Couldn't start tracking: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// ── Creators ─────────────────────────────────────────────────────────────────

export async function createCreator(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { error: "Add a name." };
  const handles: Creator["handles"] = {};
  for (const p of PLATFORMS) {
    const h = text(form, `handle_${p}`).replace(/^@/, "");
    if (h) handles[p] = h;
  }
  await insertCreator({ name, handles, rateUsd: money(form, "rateUsd"), contractNotes: text(form, "contractNotes") });
  revalidatePath("/creators");
  return { error: null };
}

// ── Videos ───────────────────────────────────────────────────────────────────

export async function createVideo(_prev: FormState, form: FormData): Promise<FormState> {
  const creatorId = text(form, "creatorId");
  const title = text(form, "title");
  const rawUrl = text(form, "url");
  const state = text(form, "pipelineState") as PipelineState;
  if (!creatorId) return { error: "Pick a creator." };
  if (!title) return { error: "Add a title so you can recognize this video later." };
  if (!PIPELINE_STATES.includes(state)) return { error: "Pick a starting stage." };

  const creator = await getCreator(creatorId);
  if (!creator) return { error: "That creator no longer exists." };

  const parsed = rawUrl ? parseVideoUrl(rawUrl) : null;
  if (rawUrl && !parsed) return { error: "That URL isn't from YouTube, TikTok, Instagram or Facebook." };
  const posted = state === "posted" || state === "paid";
  if (posted && !parsed) return { error: "Posted videos need a URL so we can track them." };

  const now = new Date().toISOString();
  // Backfill history up to the starting stage so turnaround math has a brief stamp.
  const history = PIPELINE_STATES.slice(0, PIPELINE_STATES.indexOf(state) + 1)
    .filter((s) => s !== "changes_requested")
    .map((s) => ({ state: s, at: now }));
  const id = await insertVideo({
    creatorId,
    title,
    platform: parsed?.platform ?? null,
    url: parsed?.url ?? null,
    externalId: parsed?.externalId ?? null,
    costUsd: money(form, "costUsd") ?? creator.rateUsd,
    pipelineState: state,
    stateHistory: history,
    postedAt: posted ? now : null,
  });
  if (posted) await tryStartTracking(id);
  revalidatePath("/");
  redirect(`/videos/${id}`);
}

export async function transitionVideo(videoId: string, to: PipelineState): Promise<FormState> {
  const video = await getVideo(videoId);
  if (!video) return { error: "Video not found." };
  if (!canTransition(video.pipelineState, to)) {
    return { error: `Can't move from ${PIPELINE_LABELS[video.pipelineState]} to ${PIPELINE_LABELS[to]}.` };
  }
  if (to === "posted" && !video.url) return { error: "Add the posted URL first." };
  await transitionVideoState(videoId, to, to === "posted" ? new Date().toISOString() : null);
  if (to === "posted") await tryStartTracking(videoId);
  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/");
  return { error: null };
}

export async function updateVideoDetails(videoId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const video = await getVideo(videoId);
  if (!video) return { error: "Video not found." };
  const title = text(form, "title");
  const rawUrl = text(form, "url");
  const postedAtRaw = text(form, "postedAt");
  if (!title) return { error: "Title can't be empty." };
  const posted = video.pipelineState === "posted" || video.pipelineState === "paid";

  const fields: Parameters<typeof updateVideoFields>[1] = { title, costUsd: money(form, "costUsd") };
  if (rawUrl !== (video.url ?? "")) {
    if (rawUrl) {
      const parsed = parseVideoUrl(rawUrl);
      if (!parsed) return { error: "That URL isn't from YouTube, TikTok, Instagram or Facebook." };
      Object.assign(fields, { url: parsed.url, platform: parsed.platform, externalId: parsed.externalId });
    } else if (posted) {
      return { error: "Posted videos need a URL." };
    } else {
      Object.assign(fields, { url: null, platform: null, externalId: null });
    }
  }
  if (postedAtRaw) {
    const d = new Date(postedAtRaw);
    if (Number.isNaN(d.getTime())) return { error: "Posted time isn't a valid date." };
    fields.postedAt = d.toISOString();
  }
  await updateVideoFields(videoId, fields);
  // A newly added URL on a posted video, or a tracker that never ran: start it.
  if (posted && video.trackingStatus !== "tracking") await tryStartTracking(videoId);
  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/");
  return { error: null };
}

export async function logSnapshot(videoId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const views = count(form, "views");
  if (views == null) return { error: "Views must be a whole number." };
  await recordSnapshot(
    videoId,
    { views, likes: count(form, "likes") ?? 0, comments: count(form, "comments") ?? 0, shares: count(form, "shares"), saves: count(form, "saves") },
    "manual",
  );
  revalidatePath(`/videos/${videoId}`);
  revalidatePath("/");
  return { error: null };
}

export async function refreshStatsNow(videoId: string): Promise<FormState> {
  await tryStartTracking(videoId);
  revalidatePath(`/videos/${videoId}`);
  return { error: null };
}

export async function deleteVideo(videoId: string): Promise<void> {
  await deleteVideoById(videoId);
  revalidatePath("/videos");
  redirect("/videos");
}

export interface BulkResult {
  error: string | null;
  results: { line: number; label: string; status: "logged" | "not_found" | "invalid"; detail: string; videoId?: string }[];
}

/** Log stats for many videos at once from a pasted spreadsheet. */
export async function bulkLogStats(_prev: BulkResult, form: FormData): Promise<BulkResult> {
  const rows = parseBulkStats(text(form, "rows"));
  if (rows.length === 0) return { error: "Paste at least one row: URL, views, likes, comments, shares, saves.", results: [] };
  const results: BulkResult["results"] = [];
  for (const row of rows) {
    if (!row.ok) {
      results.push({ line: row.line, label: row.raw.slice(0, 80), status: "invalid", detail: row.error });
      continue;
    }
    const video = await findVideoByUrl(row.parsed.platform, row.parsed.externalId, row.parsed.url);
    if (!video) {
      results.push({ line: row.line, label: row.url, status: "not_found", detail: "No video with this URL. Add it first." });
      continue;
    }
    await recordSnapshot(video.id, row.metrics, "manual");
    results.push({ line: row.line, label: video.title, status: "logged", detail: `${row.metrics.views.toLocaleString("en-US")} views`, videoId: video.id });
  }
  revalidatePath("/");
  return { error: null, results };
}

// ── Digests ──────────────────────────────────────────────────────────────────

export async function generateDigestNow(): Promise<FormState> {
  await generateDigest("manual", 7);
  revalidatePath("/digests");
  return { error: null };
}

// ── Settings ─────────────────────────────────────────────────────────────────

async function appUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.APP_URL || `${proto}://${host}`;
}

export async function turnOnAutomaticChecks(): Promise<FormState> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { error: "Set CRON_SECRET in your Vercel environment variables first, then redeploy." };
  const url = await appUrl();
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return { error: "Turn this on from the deployed site, not localhost: the database needs a public URL to call." };
  }
  try {
    await installScheduler(url, secret);
  } catch (err) {
    return { error: `Couldn't set up the schedule: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath("/settings");
  return { error: null };
}

export async function turnOffAutomaticChecks(): Promise<FormState> {
  await removeScheduler();
  revalidatePath("/settings");
  return { error: null };
}
