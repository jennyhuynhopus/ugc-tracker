import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canTransition,
  classifyPerformance,
  deriveMetrics,
  parseBulkStats,
  parseCount,
  parseProfileUrl,
  parseVideoUrl,
  pollDelayMs,
  trailingVelocity,
  velocityBenchmark,
  viewsAt24h,
} from "./domain.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("parseVideoUrl detects platform and id", () => {
  assert.deepEqual(
    [
      parseVideoUrl("https://www.youtube.com/watch?v=abc123"),
      parseVideoUrl("https://youtube.com/shorts/xyz789"),
      parseVideoUrl("https://youtu.be/def456"),
      parseVideoUrl("https://www.tiktok.com/@creator/video/7312345678901234567"),
      parseVideoUrl("https://vm.tiktok.com/ZMabc/"),
      parseVideoUrl("https://www.instagram.com/reel/C1a2B3c4D5e/"),
      parseVideoUrl("https://www.facebook.com/watch/?v=10150"),
      parseVideoUrl("https://www.facebook.com/somepage/videos/998877/"),
    ].map((p) => p && [p.platform, p.externalId]),
    [
      ["youtube", "abc123"],
      ["youtube", "xyz789"],
      ["youtube", "def456"],
      ["tiktok", "7312345678901234567"],
      ["tiktok", null],
      ["instagram", "C1a2B3c4D5e"],
      ["facebook", "10150"],
      ["facebook", "998877"],
    ],
  );
  assert.equal(parseVideoUrl("https://vimeo.com/123"), null);
  assert.equal(parseVideoUrl("not a url at all"), null);
  assert.equal(parseVideoUrl("tiktok.com/@a/video/1")?.platform, "tiktok");
});

test("pipeline transitions", () => {
  assert.ok(canTransition("briefed", "draft_submitted"));
  assert.ok(canTransition("in_review", "changes_requested"));
  assert.ok(canTransition("changes_requested", "draft_submitted"));
  assert.ok(!canTransition("briefed", "posted"));
  assert.ok(!canTransition("paid", "posted"));
});

test("poll cadence decays then stops", () => {
  assert.equal(pollDelayMs(0), 15 * MIN);
  assert.equal(pollDelayMs(5 * HOUR), 15 * MIN);
  assert.equal(pollDelayMs(6 * HOUR), HOUR);
  assert.equal(pollDelayMs(2 * DAY), HOUR);
  assert.equal(pollDelayMs(3 * DAY), DAY);
  assert.equal(pollDelayMs(29 * DAY), DAY);
  assert.equal(pollDelayMs(30 * DAY), null);
});

test("trailingVelocity uses the ~24h window", () => {
  const t0 = Date.parse("2026-10-01T00:00:00Z");
  const at = (h: number, views: number) => ({ capturedAt: new Date(t0 + h * HOUR).toISOString(), views });
  assert.equal(trailingVelocity([at(0, 0)]), null);
  assert.equal(trailingVelocity([at(0, 0), at(4, 400)]), 100);
  assert.equal(trailingVelocity([at(0, 0), at(0.5, 50)]), null); // too short a span
  // Base is the newest snapshot ≥24h before the last (h=10), not the first.
  assert.equal(trailingVelocity([at(0, 0), at(10, 1000), at(20, 5000), at(34, 3400)]), (3400 - 1000) / 24);
});

test("viewsAt24h only counts a reading 24-36h after posting", () => {
  const posted = "2026-10-01T00:00:00Z";
  const at = (h: number, views: number) => ({ capturedAt: new Date(Date.parse(posted) + h * 3_600_000).toISOString(), views });
  assert.equal(viewsAt24h([at(2, 100), at(25, 900), at(40, 1500)], posted), 900);
  assert.equal(viewsAt24h([at(400, 9000)], posted), null); // tracked weeks later
});

test("velocityBenchmark needs 3 points and uses the median", () => {
  assert.equal(velocityBenchmark([2400, 4800]), null);
  assert.equal(velocityBenchmark([2400, 4800, 240_000]), 200);
});

test("classifyPerformance", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const posted = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  const base = { now, benchmark: 100 };
  assert.equal(classifyPerformance({ ...base, postedAt: null, velocity: 1, totalViews: 1 }), null);
  assert.equal(classifyPerformance({ ...base, postedAt: posted(3), velocity: 200, totalViews: 600 }), "breaking_out");
  assert.equal(classifyPerformance({ ...base, postedAt: posted(3), velocity: 20, totalViews: 60 }), "warming_up");
  assert.equal(classifyPerformance({ ...base, postedAt: posted(72), velocity: 50, totalViews: 10_000 }), "steady");
  assert.equal(classifyPerformance({ ...base, postedAt: posted(72), velocity: null, totalViews: 10_000 }), null); // no history yet
  assert.equal(classifyPerformance({ ...base, postedAt: posted(72), velocity: 2, totalViews: 10_000 }), "stalled");
  // No benchmark yet: never breaking out.
  assert.equal(
    classifyPerformance({ now, benchmark: null, postedAt: posted(3), velocity: 1e6, totalViews: 1e6 }),
    "warming_up",
  );
});

test("deriveMetrics", () => {
  const m = deriveMetrics({ views: 10_000, likes: 500, comments: 100, shares: 200, saves: null }, 250);
  assert.equal(m.engagementRate, 0.08);
  assert.equal(m.shareRate, 0.02);
  assert.equal(m.saveRate, null);
  assert.equal(m.cpm, 25);
  assert.equal(deriveMetrics(null, 100).cpm, null);
});

test("parseCount handles separators and suffixes", () => {
  assert.equal(parseCount("12,345"), 12345);
  assert.equal(parseCount("12.3K"), 12300);
  assert.equal(parseCount("1.2m"), 1_200_000);
  assert.equal(parseCount("—"), null);
  assert.equal(parseCount("abc"), null);
});

test("parseBulkStats parses tab and comma rows, skips header, reports bad rows", () => {
  const text = [
    "URL\tViews\tLikes\tComments\tShares\tSaves",
    "https://www.tiktok.com/@a/video/111\t12,345\t800\t40\t25\t60",
    "https://youtu.be/abc, 5.2K, 300, 12",
    "https://vimeo.com/1, 100",
    "https://www.instagram.com/reel/XYZ/\t",
    "",
  ].join("\n");
  const rows = parseBulkStats(text);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0].ok && [rows[0].parsed.platform, rows[0].metrics], [
    "tiktok",
    { views: 12345, likes: 800, comments: 40, shares: 25, saves: 60 },
  ]);
  assert.deepEqual(rows[1].ok && [rows[1].parsed.externalId, rows[1].metrics.views, rows[1].metrics.shares], [
    "abc",
    5200,
    null,
  ]);
  assert.equal(rows[2].ok, false);
  assert.equal(rows[3].ok, false);
  assert.equal(rows[3].line, 5);
});

test("parseProfileUrl reads profile links and bare handles", () => {
  const p = (s: string, f: Parameters<typeof parseProfileUrl>[1] = null) => {
    const r = parseProfileUrl(s, f);
    return r && [r.platform, r.handle];
  };
  assert.deepEqual(p("https://www.tiktok.com/@maya.makes?lang=en"), ["tiktok", "maya.makes"]);
  assert.deepEqual(p("tiktok.com/@maya"), ["tiktok", "maya"]);
  assert.deepEqual(p("https://www.instagram.com/leo.edits/"), ["instagram", "leo.edits"]);
  assert.deepEqual(p("https://www.youtube.com/@AvaBrooks"), ["youtube", "AvaBrooks"]);
  assert.deepEqual(p("https://youtube.com/channel/UC123abc"), ["youtube", "UC123abc"]);
  assert.deepEqual(p("https://www.facebook.com/noraali"), ["facebook", "noraali"]);
  assert.deepEqual(p("https://www.facebook.com/profile.php?id=1000123"), ["facebook", "1000123"]);
  assert.deepEqual(p("@samclips", "tiktok"), ["tiktok", "samclips"]);
  assert.equal(p("@samclips"), null); // bare handle needs a platform
  assert.equal(p("https://www.instagram.com/reel/C1a2B3/"), null); // a post, not a profile
  assert.equal(p("https://www.tiktok.com/@maya/video/123")?.[1], "maya");
  assert.equal(p("https://vimeo.com/someone"), null);
});
