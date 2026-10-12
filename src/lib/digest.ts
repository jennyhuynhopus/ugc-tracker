import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { type DigestContent, deriveMetrics, PLATFORM_LABELS, turnaroundDays } from "./domain";
import { createDigest, finishDigest, listCreators, listSnapshotsFor, listVideos } from "./store";

const DAY = 86_400_000;
const MODEL = "claude-opus-5-5";

const DigestSchema = z.object({
  headline: z.string().describe("One sentence: the single most important takeaway this period."),
  topPerformers: z
    .array(z.object({ videoId: z.string(), title: z.string(), why: z.string() }))
    .describe("Up to 5 videos that outperformed, with the likely reason (hook, format, topic, timing)."),
  needsAttention: z
    .array(z.object({ videoId: z.string(), title: z.string(), issue: z.string() }))
    .describe("Stalled videos, poor CPM, or polling errors worth a human look. Up to 5."),
  creatorComparison: z
    .array(z.object({ creator: z.string(), summary: z.string() }))
    .describe("One line per creator comparing CPM, views and turnaround against the team."),
  patterns: z.array(z.string()).describe("Patterns in hooks, captions, formats or platforms that outperform. 2-5 items."),
  recommendations: z.array(z.string()).describe("2-4 concrete next actions for the team."),
});

type DigestInput = Awaited<ReturnType<typeof buildDigestInput>>;

export async function buildDigestInput(periodStart: Date, periodEnd: Date) {
  // Everything still inside its 30-day tracking window.
  const windowStart = periodEnd.getTime() - 30 * DAY;
  const all = await listVideos();
  const vids = all.filter(
    (v) =>
      (v.pipelineState === "posted" || v.pipelineState === "paid") &&
      v.postedAt != null &&
      new Date(v.postedAt).getTime() >= windowStart,
  );
  const creators = await listCreators();
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));
  const snaps = await listSnapshotsFor(vids.map((v) => v.id));
  const startIso = periodStart.toISOString();

  const videos = vids.map((v) => {
    const before = snaps.filter((s) => s.videoId === v.id && s.capturedAt < startIso).at(-1);
    const totalViews = v.latest?.views ?? 0;
    const d = deriveMetrics(v.latest, v.costUsd);
    return {
      videoId: v.id,
      title: v.title,
      creator: creatorName.get(v.creatorId) ?? "Unknown",
      platform: v.platform ? PLATFORM_LABELS[v.platform] : null,
      postedAt: v.postedAt,
      performanceState: v.performanceState,
      totalViews,
      viewsGainedThisPeriod: totalViews - (before?.views ?? 0),
      viewsFirst24h: v.views24h,
      viewsPerHourTrailing24h: v.velocity == null ? null : Math.round(v.velocity),
      engagementRate: d.engagementRate,
      shareRate: d.shareRate,
      saveRate: d.saveRate,
      costUsd: v.costUsd,
      cpmUsd: d.cpm,
      lastPollError: v.lastPollError,
      caption: v.caption?.slice(0, 600) ?? null,
    };
  });

  const creatorRows = creators
    .map((c) => {
      const mine = vids.filter((v) => v.creatorId === c.id);
      const views = mine.reduce((n, v) => n + (v.latest?.views ?? 0), 0);
      const spend = mine.reduce((n, v) => n + (v.costUsd ?? 0), 0);
      const turnarounds = mine.map(turnaroundDays).filter((x): x is number => x != null);
      return {
        creator: c.name,
        videos: mine.length,
        totalViews: views,
        spendUsd: spend,
        cpmUsd: views > 0 && spend > 0 ? (spend / views) * 1000 : null,
        avgBriefToPostDays: turnarounds.length ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length : null,
      };
    })
    .filter((c) => c.videos > 0);

  return { periodStart: startIso, periodEnd: periodEnd.toISOString(), videos, creators: creatorRows };
}

// ── Without AI: a digest built straight from the numbers ─────────────────────

const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function summaryDigest(input: DigestInput): DigestContent {
  const vids = input.videos;
  if (vids.length === 0) {
    return {
      headline: "No posted videos in the last 30 days yet. Add videos and stats to get a real digest.",
      topPerformers: [],
      needsAttention: [],
      creatorComparison: [],
      patterns: [],
      recommendations: ["Add your posted videos with their URLs so stats start coming in."],
    };
  }
  const byGain = [...vids].sort((a, b) => b.viewsGainedThisPeriod - a.viewsGainedThisPeriod);
  const totalGain = vids.reduce((n, v) => n + v.viewsGainedThisPeriod, 0);
  const top = byGain.filter((v) => v.viewsGainedThisPeriod > 0).slice(0, 5);

  const attention = [
    ...vids.filter((v) => v.lastPollError).map((v) => ({ v, issue: `Stats couldn't be fetched: ${v.lastPollError}` })),
    ...vids.filter((v) => v.performanceState === "stalled").map((v) => ({ v, issue: "Stalled: under 1% new views in the last day." })),
  ];
  const cpms = vids.map((v) => v.cpmUsd).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medianCpm = cpms.length ? cpms[Math.floor(cpms.length / 2)] : null;
  if (medianCpm != null) {
    for (const v of vids) {
      if (v.cpmUsd != null && v.cpmUsd > medianCpm * 2 && !attention.some((a) => a.v.videoId === v.videoId)) {
        attention.push({ v, issue: `High CPM: ${usd(v.cpmUsd)} vs team median ${usd(medianCpm)}.` });
      }
    }
  }

  const creators = [...input.creators].sort((a, b) => (a.cpmUsd ?? Infinity) - (b.cpmUsd ?? Infinity));
  const byPlatform = new Map<string, { views: number; count: number }>();
  for (const v of vids) {
    const p = v.platform ?? "Unknown";
    const cur = byPlatform.get(p) ?? { views: 0, count: 0 };
    byPlatform.set(p, { views: cur.views + v.totalViews, count: cur.count + 1 });
  }
  const platforms = [...byPlatform.entries()]
    .map(([p, s]) => ({ p, avg: s.views / s.count, count: s.count }))
    .sort((a, b) => b.avg - a.avg);

  const best = top[0];
  return {
    headline: best
      ? `${fmt.format(totalGain)} new views this week across ${plural(vids.length, "video")}; "${best.title}" led with ${fmt.format(best.viewsGainedThisPeriod)}.`
      : `No new views recorded this week across ${plural(vids.length, "tracked video")}.`,
    topPerformers: top.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      why: `+${fmt.format(v.viewsGainedThisPeriod)} views this week${v.viewsPerHourTrailing24h != null ? `, ${fmt.format(v.viewsPerHourTrailing24h)}/hr now` : ""}${v.engagementRate != null ? `, ${(v.engagementRate * 100).toFixed(1)}% engagement` : ""}.`,
    })),
    needsAttention: attention.slice(0, 5).map(({ v, issue }) => ({ videoId: v.videoId, title: v.title, issue })),
    creatorComparison: creators.map((c) => ({
      creator: c.creator,
      summary: `${plural(c.videos, "video")}, ${fmt.format(c.totalViews)} views, ${c.cpmUsd != null ? `${usd(c.cpmUsd)} CPM` : "no CPM yet"}${c.avgBriefToPostDays != null ? `, ${c.avgBriefToPostDays.toFixed(1)} days brief to post` : ""}.`,
    })),
    patterns: platforms.length > 1
      ? [`${platforms[0].p} averages ${fmt.format(platforms[0].avg)} views per video, the highest of your platforms (${platforms.map((x) => `${x.p} ${fmt.format(x.avg)}`).join(", ")}).`]
      : [],
    recommendations: [
      ...(creators[0]?.cpmUsd != null ? [`Brief more videos with ${creators[0].creator}, your lowest-CPM creator.`] : []),
      ...(attention.length ? ["Check the videos under Needs attention."] : []),
      "Add an ANTHROPIC_API_KEY for AI-written insights on why videos worked.",
    ],
  };
}

// ── With AI: Claude reads the numbers and captions ───────────────────────────

async function aiDigest(input: DigestInput): Promise<{ content: DigestContent; model: string }> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(DigestSchema) },
    messages: [
      {
        role: "user",
        content: [
          "You're the analyst for a team that pays UGC creators to post short-form videos.",
          "Below is this period's performance data as JSON. Write the weekly digest.",
          "",
          "- Identify top performers and say WHY they likely worked, citing the caption/hook when it's available.",
          "- Flag stalled videos, poor cost per 1K views (CPM), and any polling errors.",
          "- Compare creators on CPM, reach and brief-to-post turnaround.",
          "- Note patterns in hooks, formats or platforms that outperform.",
          "- Be specific: use real numbers and titles. Only reference videoIds that appear in the data.",
          "- If there's little or no data, say so plainly instead of inventing insights.",
          "",
          "Rates are fractions (0.05 = 5%). Views per hour in the first 24h is the strongest early predictor of a hit.",
          "",
          "```json",
          JSON.stringify(input),
          "```",
        ].join("\n"),
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Claude didn't return a digest (stop reason: ${response.stop_reason}).`);
  }
  return { content: response.parsed_output, model: response.model };
}

/** Generate and store a digest for the last `periodDays`. AI when a key is set, else numbers-only. */
export async function generateDigest(trigger: "schedule" | "manual", periodDays = 7): Promise<string> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * DAY);
  const id = await createDigest({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), trigger });
  try {
    const input = await buildDigestInput(periodStart, periodEnd);
    if (process.env.ANTHROPIC_API_KEY && input.videos.length > 0) {
      try {
        const { content, model } = await aiDigest(input);
        await finishDigest(id, { status: "ready", source: "ai", content, error: null, model, videoCount: input.videos.length });
        return id;
      } catch (err) {
        // Fall back to the numbers-only digest rather than failing the week.
        console.error("AI digest failed, using summary:", err);
        const content = summaryDigest(input);
        const note = `AI digest failed (${err instanceof Error ? err.message : String(err)}); showing the numbers-only summary.`;
        await finishDigest(id, { status: "ready", source: "summary", content, error: note, model: null, videoCount: input.videos.length });
        return id;
      }
    }
    await finishDigest(id, { status: "ready", source: "summary", content: summaryDigest(input), error: null, model: null, videoCount: input.videos.length });
  } catch (err) {
    await finishDigest(id, { status: "failed", source: null, content: null, error: err instanceof Error ? err.message : String(err), model: null, videoCount: 0 });
  }
  return id;
}

/** Most recent Monday 16:00 UTC (9am PT) at or before `now`. */
export function lastDigestSlot(now: number): number {
  const d = new Date(now);
  d.setUTCHours(16, 0, 0, 0);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 7);
  return d.getTime();
}

/** True when this week's scheduled digest hasn't been written yet. */
export function isWeeklyDigestDue(now: number, lastScheduledAt: string | null): boolean {
  return lastScheduledAt == null || new Date(lastScheduledAt).getTime() < lastDigestSlot(now);
}
