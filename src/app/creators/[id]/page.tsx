import Link from "next/link";
import { notFound } from "next/navigation";
import { PerformanceBadge, PipelineBadge } from "@/components/Badges";
import { AddLinksForm, DeleteCreatorButton, EditCreatorForm, RemovePlatformButton } from "@/components/CreatorEdit";
import { PlatformIcon } from "@/components/icons";
import { SyncButton } from "@/components/SyncButton";
import { listCreatorStats, listVideoRows } from "@/lib/data";
import { PLATFORM_LABELS, PLATFORMS, parseProfileUrl } from "@/lib/domain";
import { fmtNumber, fmtRelative, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [stats, videos] = await Promise.all([listCreatorStats(), listVideoRows()]);
  const s = stats.find((x) => x.creator.id === id);
  if (!s) notFound();
  const c = s.creator;
  const mine = videos.filter((v) => v.creatorId === id);
  const platforms = PLATFORMS.filter((p) => c.handles[p]);
  const totalFollowers = Object.values(c.followers).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div>
      <div className="crumbs">
        <Link href="/creators">Creators</Link>
        <span className="sep">›</span>
        <strong>{c.name}</strong>
        <span className="spacer" />
        <Link href="/videos/new" className="btn btn-primary btn-sm">Add video</Link>
      </div>

      <div className="kpi-grid">
        <div className="card warm kpi-card"><div><div className="kpi-label">Followers</div><div className="kpi-value">{totalFollowers ? fmtNumber(totalFollowers) : "—"}</div></div></div>
        <div className="card warm kpi-card"><div><div className="kpi-label">Views</div><div className="kpi-value">{fmtNumber(s.totalViews)}</div></div></div>
        <div className="card warm kpi-card"><div><div className="kpi-label">CPM</div><div className="kpi-value">{fmtUsd(s.cpm)}</div></div></div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Platforms</h2>
                <div className="muted small">
                  {c.lastSyncedAt ? `Videos pulled ${fmtRelative(c.lastSyncedAt)} · refreshes hourly` : "Videos not pulled yet"}
                </div>
              </div>
              <SyncButton creatorId={c.id} />
            </div>
            {c.syncError && <p className="notice" style={{ margin: "12px 20px 0" }}>{c.syncError}</p>}
            {platforms.length === 0 && <p className="empty">No profiles yet. Add one on the right.</p>}
            {platforms.map((p) => {
              const handle = c.handles[p] as string;
              const url = parseProfileUrl(`@${handle}`, p)?.url;
              return (
                <div key={p} className="list-row">
                  <div className="tile" style={{ width: 40, height: 40, borderRadius: 10 }}><PlatformIcon platform={p} /></div>
                  <div className="list-main">
                    <div className="list-title">{PLATFORM_LABELS[p]}</div>
                    <div className="list-sub">
                      {url ? <a className="link" href={url} target="_blank" rel="noreferrer">@{handle} ↗</a> : `@${handle}`}
                    </div>
                  </div>
                  <span className="list-value">{c.followers[p] != null ? `${fmtNumber(c.followers[p])} followers` : "—"}</span>
                  <RemovePlatformButton creatorId={c.id} platform={p} />
                </div>
              );
            })}
          </section>

          <section className="card table-wrap">
            <div className="card-head"><h2>Videos</h2><span className="muted small">{mine.length} total</span></div>
            {mine.length === 0 ? (
              <p className="empty">No videos for {c.name} yet.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Video</th><th>Stage</th><th>Performance</th><th className="num">Views</th><th className="num">CPM</th></tr>
                </thead>
                <tbody>
                  {mine.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-title"><Link className="link" href={`/videos/${v.id}`}>{v.title}</Link></td>
                      <td><PipelineBadge state={v.pipelineState} /></td>
                      <td><PerformanceBadge state={v.performanceState} /></td>
                      <td className="num">{fmtNumber(v.latest?.views)}</td>
                      <td className="num">{fmtUsd(v.cpm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad"><AddLinksForm creatorId={c.id} /></section>
          <section className="card card-pad">
            <h2>Details</h2>
            <EditCreatorForm creatorId={c.id} name={c.name} rateUsd={c.rateUsd} contractNotes={c.contractNotes} />
          </section>
          <div><DeleteCreatorButton id={c.id} name={c.name} /></div>
        </div>
      </div>
    </div>
  );
}
