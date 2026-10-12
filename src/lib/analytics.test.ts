import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOverview, type DailyRow, dailyGains, dayRange, postingStreak } from "./analytics.ts";
import type { Creator, Video } from "./domain.ts";

const NOW = Date.parse("2026-10-12T15:00:00Z"); // a Monday

function video(id: string, creatorId: string, postedAt: string, platform: Video["platform"] = "tiktok"): Video {
  return {
    id, creatorId, title: id, platform, url: null, externalId: null, costUsd: null,
    pipelineState: "posted", stateHistory: [], postedAt, caption: null, latest: null,
    performanceState: null, velocity: null, views24h: null, lastPolledAt: null,
    lastPollError: null, nextPollAt: null, trackingStatus: "tracking",
    createdAt: postedAt, updatedAt: postedAt,
  };
}

const creator = (id: string, name: string): Creator => ({ id, name, handles: {}, rateUsd: null, contractNotes: "", createdAt: "" });
const row = (videoId: string, day: string, views: number, likes = 0, comments = 0): DailyRow => ({ videoId, day, views, likes, comments });

test("dayRange ends today, oldest first", () => {
  assert.deepEqual(dayRange(3, NOW), ["2026-10-10", "2026-10-11", "2026-10-12"]);
});

test("dailyGains subtracts the previous day or the baseline", () => {
  const gains = dailyGains(
    [row("a", "2026-10-11", 1500), row("a", "2026-10-10", 1000), row("b", "2026-10-11", 300)],
    new Map([["a", { views: 400, likes: 0, comments: 0 }]]),
  );
  const g = (id: string, day: string) => gains.find((x) => x.videoId === id && x.day === day)?.views;
  assert.equal(g("a", "2026-10-10"), 600); // 1000 - baseline 400
  assert.equal(g("a", "2026-10-11"), 500);
  assert.equal(g("b", "2026-10-11"), 300); // first-ever snapshot counts in full
});

test("postingStreak tolerates no post yet today", () => {
  const days = new Set(["2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(postingStreak(days, NOW), 3);
  assert.equal(postingStreak(new Set(["2026-10-12", ...days]), NOW), 4);
  assert.equal(postingStreak(new Set(["2026-10-08"]), NOW), 0);
});

test("buildOverview: KPIs vs previous period, series, tops, platform filter", () => {
  const videos = [
    video("a", "c1", "2026-10-11T10:00:00Z"),
    video("b", "c2", "2026-10-12T09:00:00Z", "youtube"),
    video("old", "c1", "2026-10-08T09:00:00Z"), // previous 3-day period
  ];
  const rows = [
    row("old", "2026-10-08", 2000, 100, 10),
    row("old", "2026-10-11", 2600, 120, 12),
    row("a", "2026-10-11", 5000, 400, 50),
    row("a", "2026-10-12", 9000, 700, 80),
    row("b", "2026-10-12", 1000, 50, 5),
  ];
  const creators = [creator("c1", "Maya"), creator("c2", "Leo")];
  const o = buildOverview({ days: 3, now: NOW, platform: null, videos, creators, rows, baselines: new Map() });

  assert.deepEqual(o.kpis.posted, { value: 2, prev: 1 });
  assert.deepEqual(o.kpis.activeCreators, { value: 2, prev: 1 });
  assert.equal(o.kpis.views.value, 600 + 9000 + 1000); // old's gain + a + b
  assert.equal(o.kpis.views.prev, 2000);
  assert.deepEqual(o.series.map((s) => s.day), ["2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.deepEqual(o.series.map((s) => s.posted), [0, 1, 1]);
  assert.deepEqual(o.series.map((s) => s.views), [0, 5600, 5000]);
  assert.deepEqual(o.topVideos.map((t) => [t.video.id, t.views]), [["a", 9000], ["b", 1000], ["old", 600]]);
  assert.deepEqual(o.topCreators.map((t) => [t.creator.name, t.views, t.videos]), [["Maya", 9600, 1], ["Leo", 1000, 1]]);
  assert.equal(o.streak, 2);
  assert.equal(o.heatmap.length, 26 * 7);
  assert.equal(o.heatmap.find((h) => h.day === "2026-10-11")?.count, 1);

  const yt = buildOverview({ days: 3, now: NOW, platform: "youtube", videos, creators, rows, baselines: new Map() });
  assert.equal(yt.kpis.views.value, 1000);
  assert.deepEqual(yt.topCreators.map((t) => t.creator.name), ["Leo"]);
});
