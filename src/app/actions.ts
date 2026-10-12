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
  PLATFORM_LABELS,
  type PipelineState,
  PLATFORMS,
  type Platform,
  parseBulkStats,
  type ParsedProfile,
  parseProfileUrl,
  parseVideoUrl,
} from "@/lib/domain";
import { startTracking } from "@/lib/poll";
import { fetchProfile } from "@/lib/scrape";
import { syncCreator } from "@/lib/sync";
import { installScheduler, removeScheduler } from "@/lib/scheduler";
import {
  deleteCreatorById,
  deleteVideoById,
  findCreatorByHandle,
  findVideoByUrl,
  getCreator,
  getVideo,
  insertCreator,
  listCreators,
  updateCreator,
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

/** Look up name + followers for each profile (when a ScrapeCreators key is set). */
async function lookUpProfiles(profiles: ParsedProfile[]) {
  const followers: Creator["followers"] = {};
  let name: string | null = null;
  const problems: string[] = [];
  if (!process.env.SCRAPECREATORS_API_KEY) return { followers, name, problems };
  for (const p of profiles) {
    if (!p) continue;
    try {
      const info = await fetchProfile(p.platform, p.handle, p.url);
      name ??= info.name;
      if (info.followers != null) followers[p.platform] = info.followers;
    } catch (err) {
      problems.push(`Couldn't read the ${PLATFORM_LABELS[p.platform]} profile (${err instanceof Error ? err.message : String(err)}).`);
    }
  }
  return { followers, name, problems };
}

/**
 * Read profile links (one per line, or separated by spaces/commas) into one
 * handle per platform. Errors name the offending line.
 */
async function readProfileLinks(raw: string, creatorId: string | null) {
  const words = raw.split(/[\s,]+/).map((w) => w.trim()).filter(Boolean);
  const profiles: ParsedProfile[] = [];
  for (const w of words) {
    const p = parseProfileUrl(w);
    if (!p) return { error: `"${w.slice(0, 60)}" isn't a TikTok, Instagram, YouTube or Facebook profile link.` };
    if (profiles.some((x) => x.platform === p.platform)) {
      return { error: `Two ${PLATFORM_LABELS[p.platform]} links. A creator has one profile per platform.` };
    }
    const owner = await findCreatorByHandle(p.platform, p.handle);
    if (owner && owner.id !== creatorId) {
      return { error: `${PLATFORM_LABELS[p.platform]} @${p.handle} already belongs to ${owner.name}.` };
    }
    profiles.push(p);
  }
  return { profiles };
}

export async function addCreator(_prev: FormState, form: FormData): Promise<FormState> {
  const read = await readProfileLinks(text(form, "links"), null);
  if ("error" in read) return { error: read.error ?? null };
  const typedName = text(form, "name");
  if (!typedName && read.profiles.length === 0) return { error: "Add a name or at least one profile link." };

  const handles: Creator["handles"] = {};
  for (const p of read.profiles) handles[p.platform] = p.handle;
  const looked = await lookUpProfiles(read.profiles);
  const name = typedName || looked.name || `@${read.profiles[0].handle}`;
  const id = await insertCreator({
    name,
    handles,
    followers: looked.followers,
    rateUsd: money(form, "rateUsd"),
    contractNotes: text(form, "contractNotes"),
  });
  // Pull their recent videos right away so the page isn't empty.
  if (process.env.SCRAPECREATORS_API_KEY && read.profiles.length) await syncCreator(id).catch(() => {});
  revalidatePath("/creators");
  revalidatePath("/");
  redirect(`/creators/${id}`);
}

export async function addCreatorLinks(creatorId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const creator = await getCreator(creatorId);
  if (!creator) return { error: "Creator not found." };
  const read = await readProfileLinks(text(form, "links"), creatorId);
  if ("error" in read) return { error: read.error ?? null };
  if (read.profiles.length === 0) return { error: "Paste a profile link." };
  const replaced = read.profiles.filter((p) => creator.handles[p.platform]).map((p) => PLATFORM_LABELS[p.platform]);
  const handles = { ...creator.handles };
  for (const p of read.profiles) handles[p.platform] = p.handle;
  const looked = await lookUpProfiles(read.profiles);
  await updateCreator(creatorId, { handles, followers: { ...creator.followers, ...looked.followers } });
  if (process.env.SCRAPECREATORS_API_KEY) await syncCreator(creatorId).catch(() => {});
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath("/creators");
  const notes = [...(replaced.length ? [`Replaced the previous ${replaced.join(", ")} link.`] : []), ...looked.problems];
  return { error: notes.length ? notes.join(" ") : null };
}

export async function removeCreatorPlatform(creatorId: string, platform: Platform): Promise<void> {
  const creator = await getCreator(creatorId);
  if (!creator) return;
  const handles = { ...creator.handles };
  const followers = { ...creator.followers };
  delete handles[platform];
  delete followers[platform];
  await updateCreator(creatorId, { handles, followers });
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath("/creators");
}

export async function updateCreatorDetails(creatorId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { error: "Name can't be empty." };
  await updateCreator(creatorId, { name, rateUsd: money(form, "rateUsd"), contractNotes: text(form, "contractNotes") });
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath("/creators");
  return { error: null };
}

export interface SyncState {
  error: string | null;
  message: string | null;
}

export async function syncCreatorNow(creatorId: string): Promise<SyncState> {
  if (!process.env.SCRAPECREATORS_API_KEY) return { error: "Add SCRAPECREATORS_API_KEY to pull videos automatically.", message: null };
  const r = await syncCreator(creatorId);
  revalidatePath(`/creators/${creatorId}`);
  revalidatePath("/creators");
  revalidatePath("/videos");
  revalidatePath("/");
  const message = `${r.added} new ${r.added === 1 ? "video" : "videos"}, ${r.updated} updated.`;
  return { error: r.errors.length ? r.errors.join(" · ") : null, message };
}

export async function syncAllCreatorsNow(): Promise<SyncState> {
  if (!process.env.SCRAPECREATORS_API_KEY) return { error: "Add SCRAPECREATORS_API_KEY to pull videos automatically.", message: null };
  const ids = (await listCreators()).map((c) => c.id);
  let added = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await syncCreator(id);
    added += r.added;
    updated += r.updated;
    errors.push(...r.errors);
  }
  revalidatePath("/creators");
  revalidatePath("/videos");
  revalidatePath("/");
  return { error: errors.length ? errors.join(" · ") : null, message: `${added} new ${added === 1 ? "video" : "videos"}, ${updated} updated across ${ids.length} creators.` };
}

export async function deleteCreator(id: string): Promise<void> {
  await deleteCreatorById(id);
  revalidatePath("/creators");
  revalidatePath("/");
  redirect("/creators");
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
