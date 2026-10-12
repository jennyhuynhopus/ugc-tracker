import { PLATFORM_LABELS, type Platform } from "@/lib/domain";
import { CreatorForm } from "@/components/CreatorForm";
import { DeleteCreatorButton } from "@/components/DeleteCreatorButton";
import { listCreatorStats } from "@/lib/data";
import { fmtNumber, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const stats = await listCreatorStats();
  const ranked = [...stats].sort((a, b) => (a.cpm ?? Number.POSITIVE_INFINITY) - (b.cpm ?? Number.POSITIVE_INFINITY));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Creators</h1>
          <p>Ranked by cost per 1K views. Lower is better.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card table-wrap" style={{ alignSelf: "start" }}>
          {ranked.length === 0 ? (
            <div className="empty">
              <h3>No creators yet</h3>
              <p>Paste their profile links on the right to add them.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Handles</th>
                  <th className="num">Videos</th>
                  <th className="num">Views</th>
                  <th className="num">Spend</th>
                  <th className="num">CPM</th>
                  <th className="num">Brief → post</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr key={s.creator.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.creator.name}</div>
                      {s.creator.rateUsd != null && (
                        <div className="faint small">{fmtUsd(s.creator.rateUsd)} / video</div>
                      )}
                    </td>
                    <td className="muted small">
                      {Object.entries(s.creator.handles)
                        .map(([p, h]) => {
                          const f = s.creator.followers[p as Platform];
                          return `${PLATFORM_LABELS[p as Platform]} @${h}${f != null ? ` (${fmtNumber(f)})` : ""}`;
                        })
                        .join(" · ") || "—"}
                    </td>
                    <td className="num">
                      {s.postedCount}
                      <span className="faint"> / {s.videoCount}</span>
                      {s.breakingOut > 0 && (
                        <span className="badge green" style={{ marginLeft: 6 }}>
                          {s.breakingOut}
                        </span>
                      )}
                    </td>
                    <td className="num">{fmtNumber(s.totalViews)}</td>
                    <td className="num">{fmtUsd(s.spendUsd)}</td>
                    <td className="num">{fmtUsd(s.cpm)}</td>
                    <td className="num">{s.avgTurnaroundDays == null ? "—" : `${s.avgTurnaroundDays.toFixed(1)}d`}</td>
                    <td><DeleteCreatorButton id={s.creator.id} name={s.creator.name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <section className="card card-pad">
          <h2>Add creators</h2>
          <CreatorForm />
        </section>
      </div>
    </div>
  );
}
