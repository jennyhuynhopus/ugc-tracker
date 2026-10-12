/**
 * Overview analytics: period KPIs with change vs the previous period, a daily
 * series (posts + views gained), top videos/creators, and a posting heatmap.
 * Pure functions over rows the store loads, so they're unit-testable.
 *
 * Days are UTC calendar days ("YYYY-MM-DD").
 */
import type { Creator, Platform, Video } from "./domain";

const DAY = 86_400_000;

export interface DailyRow {
  videoId: string;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Cumulative counts at the last snapshot that day. */
  views: number;
  likes: number;
  comments: number;
}

export type Baseline = Pick<DailyRow, "views" | "likes" | "comments">;

export interface Kpi {
  value: number;
  /** Same metric over the previous period of equal length. */
  prev: number;
}

export interface Overview {
  days: number;
  kpis: {
    posted: Kpi;
    activeCreators: Kpi;
    views: Kpi;
    likes: Kpi;
    comments: Kpi;
    /** (likes + comments) / views gained, as a fraction. */
    engagement: Kpi;
  };
  series: { day: string; posted: number; views: number }[];
  topVideos: { video: Video; creatorName: string; views: number }[];
  topCreators: { creator: Creator; views: number; videos: number }[];
  heatmap: { day: string; count: number }[];
  streak: number;
}

export function dayKey(t: number | string | Date): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** The last `n` UTC days ending today, oldest first. */
export function dayRange(n: number, now: number): string[] {
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => dayKey(today - (n - 1 - i) * DAY));
}

/**
 * Per-video gains per day: each day's cumulative value minus the previous
 * known value (the day before, or the baseline from before the window).
 *
 * A video's first-ever snapshot covers everything since posting. When we know
 * the post day and tracking started later (e.g. imported from a profile),
 * those views are spread evenly from the post day to the first snapshot day,
 * instead of all landing on the day tracking began.
 */
export function dailyGains(rows: DailyRow[], baselines: Map<string, Baseline>, postedDays: Map<string, string> = new Map()) {
  const byVideo = new Map<string, DailyRow[]>();
  for (const r of rows) byVideo.set(r.videoId, [...(byVideo.get(r.videoId) ?? []), r]);
  const out: (Baseline & { videoId: string; day: string })[] = [];
  for (const [videoId, list] of byVideo) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    const baseline = baselines.get(videoId);
    let prev = baseline ?? { views: 0, likes: 0, comments: 0 };
    const postedDay = postedDays.get(videoId);
    for (const [i, r] of list.entries()) {
      if (i === 0 && !baseline && postedDay && postedDay < r.day) {
        const days: string[] = [];
        for (let t = Date.parse(`${postedDay}T00:00:00Z`); dayKey(t) <= r.day; t += DAY) days.push(dayKey(t));
        for (const day of days) {
          out.push({
            videoId,
            day,
            views: r.views / days.length,
            likes: r.likes / days.length,
            comments: r.comments / days.length,
          });
        }
        prev = r;
        continue;
      }
      out.push({
        videoId,
        day: r.day,
        views: Math.max(0, r.views - prev.views),
        likes: Math.max(0, r.likes - prev.likes),
        comments: Math.max(0, r.comments - prev.comments),
      });
      prev = r;
    }
  }
  return out;
}

/** Consecutive days with ≥1 post, ending today (or yesterday, if nothing's posted yet today). */
export function postingStreak(postDays: Set<string>, now: number): number {
  let t = Date.parse(`${dayKey(now)}T00:00:00Z`);
  if (!postDays.has(dayKey(t))) t -= DAY;
  let streak = 0;
  while (postDays.has(dayKey(t))) {
    streak++;
    t -= DAY;
  }
  return streak;
}

export function buildOverview(input: {
  days: number;
  now: number;
  platform: Platform | null;
  videos: Video[];
  creators: Creator[];
  /** Daily rows covering at least the last 2×days. */
  rows: DailyRow[];
  /** Each video's cumulative counts before the 2×days window. */
  baselines: Map<string, Baseline>;
  heatmapWeeks?: number;
}): Overview {
  const { days, now, platform } = input;
  const videos = input.videos.filter((v) => !platform || v.platform === platform);
  const ids = new Set(videos.map((v) => v.id));
  const current = dayRange(days, now);
  const previous = dayRange(days * 2, now).slice(0, days);
  const inCurrent = new Set(current);
  const inPrevious = new Set(previous);

  const postedDays = new Map(videos.filter((v) => v.postedAt).map((v) => [v.id, dayKey(v.postedAt as string)]));
  const gains = dailyGains(
    input.rows.filter((r) => ids.has(r.videoId)),
    input.baselines,
    postedDays,
  );

  const sum = (set: Set<string>, key: keyof Baseline) =>
    gains.filter((g) => set.has(g.day)).reduce((n, g) => n + g[key], 0);

  const postedIn = (set: Set<string>) => videos.filter((v) => v.postedAt && set.has(dayKey(v.postedAt)));
  const postedNow = postedIn(inCurrent);
  const postedPrev = postedIn(inPrevious);

  const views = { value: sum(inCurrent, "views"), prev: sum(inPrevious, "views") };
  const likes = { value: sum(inCurrent, "likes"), prev: sum(inPrevious, "likes") };
  const comments = { value: sum(inCurrent, "comments"), prev: sum(inPrevious, "comments") };
  const rate = (l: number, c: number, v: number) => (v > 0 ? (l + c) / v : 0);

  const viewsByDay = new Map<string, number>();
  const viewsByVideo = new Map<string, number>();
  for (const g of gains) {
    if (!inCurrent.has(g.day)) continue;
    viewsByDay.set(g.day, (viewsByDay.get(g.day) ?? 0) + g.views);
    viewsByVideo.set(g.videoId, (viewsByVideo.get(g.videoId) ?? 0) + g.views);
  }
  const postsByDay = new Map<string, number>();
  for (const v of postedNow) {
    const d = dayKey(v.postedAt as string);
    postsByDay.set(d, (postsByDay.get(d) ?? 0) + 1);
  }

  const creatorName = new Map(input.creators.map((c) => [c.id, c.name]));
  const topVideos = videos
    .map((video) => ({ video, creatorName: creatorName.get(video.creatorId) ?? "Unknown", views: viewsByVideo.get(video.id) ?? 0 }))
    .filter((x) => x.views > 0)
    .sort((a, b) => b.views - a.views);

  const topCreators = input.creators
    .map((creator) => {
      const mine = videos.filter((v) => v.creatorId === creator.id);
      return {
        creator,
        views: mine.reduce((n, v) => n + (viewsByVideo.get(v.id) ?? 0), 0),
        videos: mine.filter((v) => v.postedAt && inCurrent.has(dayKey(v.postedAt))).length,
      };
    })
    .filter((x) => x.views > 0 || x.videos > 0)
    .sort((a, b) => b.views - a.views);

  // Heatmap: whole weeks, Monday-first, ending with the current week.
  const weeks = input.heatmapWeeks ?? 26;
  const today = Date.parse(`${dayKey(now)}T00:00:00Z`);
  const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
  const start = today - mondayOffset * DAY - (weeks - 1) * 7 * DAY;
  const allPostDays = new Map<string, number>();
  for (const v of videos) {
    if (!v.postedAt) continue;
    const d = dayKey(v.postedAt);
    allPostDays.set(d, (allPostDays.get(d) ?? 0) + 1);
  }
  const heatmap = Array.from({ length: weeks * 7 }, (_, i) => {
    const day = dayKey(start + i * DAY);
    return { day, count: start + i * DAY > today ? -1 : (allPostDays.get(day) ?? 0) };
  });

  const activeIn = (list: Video[]) => new Set(list.map((v) => v.creatorId)).size;

  return {
    days,
    kpis: {
      posted: { value: postedNow.length, prev: postedPrev.length },
      activeCreators: { value: activeIn(postedNow), prev: activeIn(postedPrev) },
      views,
      likes,
      comments,
      engagement: {
        value: rate(likes.value, comments.value, views.value),
        prev: rate(likes.prev, comments.prev, views.prev),
      },
    },
    series: current.map((day) => ({ day, posted: postsByDay.get(day) ?? 0, views: viewsByDay.get(day) ?? 0 })),
    topVideos,
    topCreators,
    heatmap,
    streak: postingStreak(new Set(allPostDays.keys()), now),
  };
}
