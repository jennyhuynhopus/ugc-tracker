import { buildOverview, dayRange, type Overview } from "./analytics";
import { type Creator, deriveMetrics, type Platform, type Snapshot, turnaroundDays, type Video } from "./domain";
import { getCreator, getVideo, listBaselines, listCreators, listDailyRows, listSnapshots, listVideos } from "./store";

export { listCreators, listDigests } from "./store";

export type VideoRow = Video & {
  creatorName: string;
  engagementRate: number | null;
  shareRate: number | null;
  saveRate: number | null;
  cpm: number | null;
};

function withMetrics(v: Video, creatorName: string): VideoRow {
  return { ...v, creatorName, ...deriveMetrics(v.latest, v.costUsd) };
}

export async function listVideoRows(): Promise<VideoRow[]> {
  const [vids, cs] = await Promise.all([listVideos(), listCreators()]);
  const names = new Map(cs.map((c) => [c.id, c.name]));
  return vids.map((v) => withMetrics(v, names.get(v.creatorId) ?? "Unknown"));
}

export interface VideoDetail {
  video: VideoRow;
  snapshots: Snapshot[];
  creator: Creator | null;
}

export async function getVideoDetail(id: string): Promise<VideoDetail | null> {
  // Not a UUID: treat as not found instead of a database error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const video = await getVideo(id);
  if (!video) return null;
  const [snapshots, creator] = await Promise.all([listSnapshots(id), getCreator(video.creatorId)]);
  return { video: withMetrics(video, creator?.name ?? "Unknown"), snapshots, creator };
}

export interface CreatorStats {
  creator: Creator;
  videoCount: number;
  postedCount: number;
  totalViews: number;
  spendUsd: number;
  cpm: number | null;
  avgTurnaroundDays: number | null;
  breakingOut: number;
}

export async function listCreatorStats(): Promise<CreatorStats[]> {
  const [cs, vids] = await Promise.all([listCreators(), listVideos()]);
  return cs.map((creator) => {
    const mine = vids.filter((v) => v.creatorId === creator.id);
    const posted = mine.filter((v) => v.pipelineState === "posted" || v.pipelineState === "paid");
    const totalViews = posted.reduce((n, v) => n + (v.latest?.views ?? 0), 0);
    const spendUsd = posted.reduce((n, v) => n + (v.costUsd ?? 0), 0);
    const turnarounds = mine.map(turnaroundDays).filter((x): x is number => x != null);
    return {
      creator,
      videoCount: mine.length,
      postedCount: posted.length,
      totalViews,
      spendUsd,
      cpm: totalViews > 0 && spendUsd > 0 ? (spendUsd / totalViews) * 1000 : null,
      avgTurnaroundDays: turnarounds.length ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length : null,
      breakingOut: posted.filter((v) => v.performanceState === "breaking_out").length,
    };
  });
}


export async function getOverview(days: number, platform: Platform | null): Promise<Overview> {
  const now = Date.now();
  const windowStart = dayRange(days * 2, now)[0];
  const [videos, creators, rows, baselines] = await Promise.all([
    listVideos(),
    listCreators(),
    listDailyRows(windowStart),
    listBaselines(windowStart),
  ]);
  return buildOverview({ days, now, platform, videos, creators, rows, baselines });
}
