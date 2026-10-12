import { pollDelayMs } from "./domain";
import { fetchStats, PermanentScrapeError } from "./scrape";
import { getVideo, listDueVideoIds, recordSnapshot, setPollStatus } from "./store";

/** Most videos one tick will poll; the rest wait for the next tick. */
const MAX_PER_TICK = 120;
const CONCURRENCY = 8;

/**
 * Poll one video now and schedule its next poll on the decaying cadence
 * (every 15 min for 6h, hourly to day 3, daily to day 30, then stop).
 */
export async function pollVideo(videoId: string): Promise<"polled" | "error" | "stopped"> {
  const video = await getVideo(videoId);
  if (!video?.url || !video.platform || !["posted", "paid"].includes(video.pipelineState)) {
    if (video) await setPollStatus(videoId, { trackingStatus: "idle", nextPollAt: null });
    return "stopped";
  }

  let postedAt = video.postedAt;
  let outcome: "polled" | "error" = "polled";
  try {
    const stats = await fetchStats(video.platform, video.url, video.externalId);
    // The platform's own publish time beats the "marked posted" stamp, which
    // can lag by hours. Fix it once, on the first successful poll.
    if (!video.lastPolledAt && stats.publishedAt) {
      postedAt = stats.publishedAt;
      await setPollStatus(videoId, { postedAt });
    }
    await recordSnapshot(videoId, stats.metrics, "scraper", { caption: stats.caption });
  } catch (err) {
    outcome = "error";
    const message = err instanceof Error ? err.message : String(err);
    await setPollStatus(videoId, { lastPollError: message });
    if (!(err instanceof PermanentScrapeError)) console.error(`poll ${videoId} failed:`, err);
  }

  const age = postedAt ? Date.now() - new Date(postedAt).getTime() : 0;
  const delay = pollDelayMs(age);
  await setPollStatus(
    videoId,
    delay == null
      ? { trackingStatus: "done", nextPollAt: null }
      : { trackingStatus: "tracking", nextPollAt: new Date(Date.now() + delay).toISOString() },
  );
  return outcome;
}

/** Mark a posted video for tracking and take its first snapshot right away. */
export async function startTracking(videoId: string): Promise<void> {
  await setPollStatus(videoId, { trackingStatus: "tracking", nextPollAt: new Date().toISOString() });
  await pollVideo(videoId);
}

/** Poll every video whose next poll is due. Called by the scheduler. */
export async function pollDueVideos(): Promise<{ polled: number; errors: number; stopped: number }> {
  const ids = await listDueVideoIds(MAX_PER_TICK);
  const result = { polled: 0, errors: 0, stopped: 0 };
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      const r = await pollVideo(id).catch(() => "error" as const);
      if (r === "polled") result.polled++;
      else if (r === "error") result.errors++;
      else result.stopped++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return result;
}
