import Link from "next/link";
import { CreatorForm } from "@/components/CreatorForm";
import { PlatformIcon } from "@/components/icons";
import { listCreatorStats } from "@/lib/data";
import { PLATFORMS } from "@/lib/domain";
import { fmtNumber, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const stats = await listCreatorStats();
  const ranked = [...stats].sort((a, b) => (a.cpm ?? Number.POSITIVE_INFINITY) - (b.cpm ?? Number.POSITIVE_INFINITY));

  return (
    <div>
      <div className="crumbs">
        <span>Analytics</span>
        <span className="sep">›</span>
        <strong>Creators</strong>
      </div>

      <div className="grid-2">
        <div className="card table-wrap" style={{ alignSelf: "start" }}>
          {ranked.length === 0 ? (
            <div className="empty">
              <h3>No creators yet</h3>
              <p>Add your first creator with their profile links.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Platforms</th>
                  <th className="num">Followers</th>
                  <th className="num">Videos</th>
                  <th className="num">Views</th>
                  <th className="num">CPM</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => {
                  const platforms = PLATFORMS.filter((p) => s.creator.handles[p]);
                  const followers = Object.values(s.creator.followers).reduce((a, b) => a + (b ?? 0), 0);
                  return (
                    <tr key={s.creator.id}>
                      <td>
                        <Link className="link" href={`/creators/${s.creator.id}`} style={{ fontWeight: 500 }}>
                          {s.creator.name}
                        </Link>
                        {s.creator.rateUsd != null && <div className="faint small">{fmtUsd(s.creator.rateUsd)} / video</div>}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 8 }}>
                          {platforms.length === 0 && <span className="faint">—</span>}
                          {platforms.map((p) => (
                            <span key={p} title={`@${s.creator.handles[p]}`} style={{ width: 18, height: 18, display: "inline-flex" }}>
                              <PlatformIcon platform={p} />
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="num">{followers ? fmtNumber(followers) : "—"}</td>
                      <td className="num">
                        {s.postedCount}
                        <span className="faint"> / {s.videoCount}</span>
                      </td>
                      <td className="num">{fmtNumber(s.totalViews)}</td>
                      <td className="num">{fmtUsd(s.cpm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <section className="card card-pad">
          <h2>Add creator</h2>
          <CreatorForm />
        </section>
      </div>
    </div>
  );
}
