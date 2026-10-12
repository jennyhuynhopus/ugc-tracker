import Link from "next/link";
import { notFound } from "next/navigation";
import { PIPELINE_LABELS, PIPELINE_STATES, turnaroundDays } from "@/lib/domain";
import { PerformanceBadge, PipelineBadge, PlatformLabel } from "@/components/Badges";
import { type ChartPoint, VelocityChart } from "@/components/VelocityChart";
import { DeleteVideoButton, EditVideoForm, RefreshStatsButton, SnapshotForm, TransitionButtons } from "@/components/VideoForms";
import { getVideoDetail } from "@/lib/data";
import { fmtDate, fmtNumber, fmtPercent, fmtRate, fmtRelative, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getVideoDetail(id);
  if (!detail) notFound();
  const { video: v, snapshots } = detail;

  const points: ChartPoint[] = snapshots.map((s, i) => {
    const t = new Date(s.capturedAt).getTime();
    const prev = snapshots[i - 1];
    const hours = prev ? (t - new Date(prev.capturedAt).getTime()) / 3_600_000 : 0;
    return { t, views: s.views, perHour: prev && hours > 0 ? Math.max(0, s.views - prev.views) / hours : null };
  });
  const turnaround = turnaroundDays(v);
  const visibleSteps = PIPELINE_STATES.filter((s) => s !== "changes_requested" || v.pipelineState === s);
  const currentIdx = PIPELINE_STATES.indexOf(v.pipelineState);
  const posted = v.pipelineState === "posted" || v.pipelineState === "paid";

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="small" style={{ margin: 0 }}>
            <Link className="link" href="/videos">
              Videos
            </Link>{" "}
            <span className="faint">/</span> <span className="muted">{v.creatorName}</span>
          </p>
          <h1 style={{ marginTop: 4 }}>{v.title}</h1>
          <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <PipelineBadge state={v.pipelineState} />
            <PerformanceBadge state={v.performanceState} />
            <PlatformLabel platform={v.platform} />
            {v.url && (
              <a className="link small" href={v.url} target="_blank" rel="noreferrer">
                Open post ↗
              </a>
            )}
          </p>
        </div>
        <DeleteVideoButton videoId={v.id} />
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card card-pad">
            <h2>Pipeline</h2>
            <ol className="stepper" style={{ marginBottom: 14 }}>
              {visibleSteps.map((s) => {
                const idx = PIPELINE_STATES.indexOf(s);
                const cls = s === v.pipelineState ? "current" : idx < currentIdx ? "done" : "";
                return (
                  <li key={s} className={`step ${cls}`}>
                    {PIPELINE_LABELS[s]}
                  </li>
                );
              })}
            </ol>
            <TransitionButtons videoId={v.id} state={v.pipelineState} hasUrl={!!v.url} />
          </section>

          <section className="card card-pad">
            <h2>Views over time</h2>
            {posted ? (
              <VelocityChart points={points} postedAt={v.postedAt} />
            ) : (
              <p className="muted">Performance tracking starts once the video is marked posted.</p>
            )}
          </section>

          <section className="card">
            <div className="card-pad" style={{ paddingBottom: 0 }}>
              <h2>Snapshots</h2>
            </div>
            {snapshots.length === 0 ? (
              <p className="muted card-pad">No snapshots yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Captured</th>
                      <th className="num">Views</th>
                      <th className="num">Likes</th>
                      <th className="num">Comments</th>
                      <th className="num">Shares</th>
                      <th className="num">Saves</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...snapshots]
                      .reverse()
                      .slice(0, 50)
                      .map((s) => (
                        <tr key={s.id}>
                          <td>{fmtDate(s.capturedAt)}</td>
                          <td className="num">{s.views.toLocaleString("en-US")}</td>
                          <td className="num">{s.likes.toLocaleString("en-US")}</td>
                          <td className="num">{s.comments.toLocaleString("en-US")}</td>
                          <td className="num">{s.shares?.toLocaleString("en-US") ?? "—"}</td>
                          <td className="num">{s.saves?.toLocaleString("en-US") ?? "—"}</td>
                          <td className="muted">{s.source === "manual" ? "Manual" : "Auto"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad">
            <h2>Performance</h2>
            <dl className="dl">
              <dt>Views</dt>
              <dd>{fmtNumber(v.latest?.views)}</dd>
              <dt>Velocity (trailing 24h)</dt>
              <dd>{fmtRate(v.velocity)}</dd>
              <dt>Views at 24h</dt>
              <dd>{fmtNumber(v.views24h)}</dd>
              <dt>Engagement rate</dt>
              <dd>{fmtPercent(v.engagementRate)}</dd>
              <dt>Share rate</dt>
              <dd>{fmtPercent(v.shareRate, 2)}</dd>
              <dt>Save rate</dt>
              <dd>{fmtPercent(v.saveRate, 2)}</dd>
              <dt>Cost</dt>
              <dd>{fmtUsd(v.costUsd)}</dd>
              <dt>CPM</dt>
              <dd>{fmtUsd(v.cpm)}</dd>
              <dt>Brief → posted</dt>
              <dd>{turnaround == null ? "—" : `${turnaround.toFixed(1)} days`}</dd>
            </dl>
          </section>

          {posted && (
            <section className="card card-pad">
              <h2>Tracking</h2>
              <dl className="dl">
                <dt>Status</dt>
                <dd>
                  {v.trackingStatus === "tracking"
                    ? "Polling"
                    : v.trackingStatus === "done"
                      ? "Finished (30 days)"
                      : "Not running"}
                </dd>
                <dt>Last polled</dt>
                <dd>{fmtRelative(v.lastPolledAt)}</dd>
                <dt>Next poll</dt>
                <dd>{fmtRelative(v.nextPollAt)}</dd>
              </dl>
              {v.lastPollError && (
                <p className="notice" style={{ marginTop: 12 }}>
                  {v.lastPollError}
                </p>
              )}
            </section>
          )}

          {posted && (
            <section className="card card-pad">
              <h2>Log stats manually</h2>
              <p className="muted small" style={{ marginTop: -6 }}>
                For when auto-polling is off or a platform blocks it.
              </p>
              <SnapshotForm videoId={v.id} />
            </section>
          )}

          <section className="card card-pad">
            <h2>Details</h2>
            <EditVideoForm videoId={v.id} title={v.title} url={v.url} costUsd={v.costUsd} postedAt={v.postedAt} />
          </section>

          {v.caption && (
            <section className="card card-pad">
              <h2>Caption</h2>
              <p className="muted small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {v.caption}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
