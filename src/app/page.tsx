import Link from "next/link";
import { PERFORMANCE_LABELS, PERFORMANCE_STATES, PIPELINE_LABELS, PIPELINE_STATES } from "@/lib/domain";
import { PerformanceBadge, PipelineBadge, PlatformLabel } from "@/components/Badges";
import { listVideoRows } from "@/lib/data";
import { fmtNumber, fmtPercent, fmtRate, fmtRelative, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

type Search = Promise<{ state?: string; perf?: string }>;

export default async function VideosPage({ searchParams }: { searchParams: Search }) {
  const { state, perf } = await searchParams;
  const all = await listVideoRows();
  const live = all.filter((v) => v.pipelineState === "posted" || v.pipelineState === "paid");

  const rows = all.filter((v) => (!state || v.pipelineState === state) && (!perf || v.performanceState === perf));

  const totalViews = live.reduce((n, v) => n + (v.latest?.views ?? 0), 0);
  const spend = live.reduce((n, v) => n + (v.costUsd ?? 0), 0);
  const breakingOut = live.filter((v) => v.performanceState === "breaking_out").length;
  const inFlight = all.filter((v) => !["posted", "paid"].includes(v.pipelineState)).length;

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Videos</h1>
          <p>Every creator video from brief to payout, with live performance once it's posted.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/videos/bulk" className="btn">
            Log stats in bulk
          </Link>
          <Link href="/videos/new" className="btn btn-primary">
            Add video
          </Link>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Live videos" value={String(live.length)} />
        <Kpi label="Total views" value={fmtNumber(totalViews)} />
        <Kpi label="Blended CPM" value={totalViews > 0 && spend > 0 ? fmtUsd((spend / totalViews) * 1000) : "—"} />
        <Kpi label="Breaking out" value={String(breakingOut)} hint={`${inFlight} in production`} />
      </div>

      <div className="filters">
        <Chip href="/" active={!state && !perf}>
          All
        </Chip>
        {PERFORMANCE_STATES.map((p) => (
          <Chip key={p} href={`/?perf=${p}`} active={perf === p}>
            {PERFORMANCE_LABELS[p]}
          </Chip>
        ))}
        <span className="faint" style={{ padding: "4px 2px" }}>
          ·
        </span>
        {PIPELINE_STATES.map((s) => (
          <Chip key={s} href={`/?state=${s}`} active={state === s}>
            {PIPELINE_LABELS[s]}
          </Chip>
        ))}
      </div>

      <div className="card table-wrap">
        {rows.length === 0 ? (
          <div className="empty">
            <h3>{all.length === 0 ? "No videos yet" : "No videos match this filter"}</h3>
            <p>
              {all.length === 0 ? (
                <>Add a creator, then add a video. Paste the posted URL and stats start tracking automatically.</>
              ) : (
                <Link className="link" href="/">
                  Clear filters
                </Link>
              )}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Creator</th>
                <th>Platform</th>
                <th>Stage</th>
                <th>Performance</th>
                <th className="num">Views</th>
                <th className="num">Velocity (24h)</th>
                <th className="num">Engagement</th>
                <th className="num">CPM</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="cell-title">
                    <Link className="link" href={`/videos/${v.id}`}>
                      {v.title}
                    </Link>
                  </td>
                  <td>{v.creatorName}</td>
                  <td>
                    <PlatformLabel platform={v.platform} />
                  </td>
                  <td>
                    <PipelineBadge state={v.pipelineState} />
                  </td>
                  <td>
                    <PerformanceBadge state={v.performanceState} />
                    {v.lastPollError && (
                      <span className="faint small" title={v.lastPollError}>
                        {" "}
                        ⚠︎
                      </span>
                    )}
                  </td>
                  <td className="num">{fmtNumber(v.latest?.views)}</td>
                  <td className="num">{fmtRate(v.velocity)}</td>
                  <td className="num">{fmtPercent(v.engagementRate)}</td>
                  <td className="num">{fmtUsd(v.cpm)}</td>
                  <td className="muted">{fmtRelative(v.lastPolledAt ?? v.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="faint small">{hint}</div>}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="chip" aria-current={active ? "true" : undefined}>
      {children}
    </Link>
  );
}
