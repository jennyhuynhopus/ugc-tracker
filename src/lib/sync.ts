/**
 * Creator sync: scan each linked profile for recent videos, add new ones, and
 * record a fresh snapshot for every video still inside the 30-day window. One
 * request per profile refreshes all of that creator's recent videos at once.
 */
import { type Platform, PLATFORM_LABELS, parseProfileUrl, TRACKING_WINDOW_MS } from "./domain";
import { fetchProfileVideos } from "./scrape";
import { findVideoByUrl, getCreator, insertVideo, listCreatorsDueSync, recordSnapshot, setPollStatus, updateCreator } from "./store";

/** How often each creator's profiles are re-scanned by the scheduler. */
export const SYNC_EVERY_MS = 60 * 60 * 1000;

export interface SyncResult {
  added: number;
  updated: number;
  errors: string[];
}

export async function syncCreator(creatorId: string): Promise<SyncResult> {
  const creator = await getCreator(creatorId);
  const result: SyncResult = { added: 0, updated: 0, errors: [] };
  if (!creator) return result;
  const windowStart = Date.now() - TRACKING_WINDOW_MS;

  for (const [platform, handle] of Object.entries(creator.handles) as [Platform, string][]) {
    const profileUrl = parseProfileUrl(`@${handle}`, platform)?.url ?? "";
    let listed: Awaited<ReturnType<typeof fetchProfileVideos>>;
    try {
      listed = await fetchProfileVideos(platform, handle, profileUrl);
    } catch (err) {
      result.errors.push(`${PLATFORM_LABELS[platform]}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    for (const item of listed) {
      if (!item.externalId || !item.publishedAt || new Date(item.publishedAt).getTime() < windowStart) continue;
      let video = await findVideoByUrl(platform, item.externalId, item.url);
      if (!video) {
        const title = (item.caption ?? "").split("\n")[0].trim().slice(0, 80) || `${PLATFORM_LABELS[platform]} video`;
        const id = await insertVideo({
          creatorId: creator.id,
          title,
          platform,
          url: item.url,
          externalId: item.externalId,
          costUsd: creator.rateUsd,
          pipelineState: "posted",
          stateHistory: [{ state: "posted", at: item.publishedAt }],
          postedAt: item.publishedAt,
        });
        // Profile scans keep these fresh; no per-video polling needed.
        await setPollStatus(id, { trackingStatus: "idle" });
        video = { id } as NonNullable<typeof video>;
        result.added++;
      } else {
        result.updated++;
      }
      await recordSnapshot(video.id, item.metrics, "scraper", { caption: item.caption });
    }
  }

  await updateCreator(creator.id, {
    lastSyncedAt: new Date(),
    syncError: result.errors.length ? result.errors.join(" · ") : null,
  });
  return result;
}

/** Scan every creator that's due. Called by the scheduler tick. */
export async function syncDueCreators(): Promise<{ creators: number; added: number; updated: number }> {
  const ids = await listCreatorsDueSync(SYNC_EVERY_MS - 5 * 60 * 1000, 25);
  const total = { creators: ids.length, added: 0, updated: 0 };
  for (const id of ids) {
    const r = await syncCreator(id).catch(() => ({ added: 0, updated: 0, errors: [] }));
    total.added += r.added;
    total.updated += r.updated;
  }
  return total;
}
