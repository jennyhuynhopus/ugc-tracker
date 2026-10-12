import Link from "next/link";
import type { Digest } from "@/lib/domain";
import { AutoRefresh, GenerateDigestButton } from "@/components/GenerateDigestButton";
import { listDigests } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function DigestsPage() {
  const list = await listDigests();
  const generating = list.some((d) => d.status === "generating");

  return (
    <div style={{ maxWidth: 860 }}>
      <AutoRefresh active={generating} />
      <div className="page-head">
        <div>
          <h1>Digests</h1>
          <p>A read-out of the last 7 days, every Monday at 9am PT. AI-written when a Claude key is set. Or generate one now.</p>
        </div>
        <GenerateDigestButton />
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          <h3>No digests yet</h3>
          <p>The first one lands next Monday. Generate one now to see it sooner.</p>
        </div>
      ) : (
        <div className="stack">
          {list.map((d, i) => (
            <DigestCard key={d.id} digest={d} open={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestCard({ digest: d, open }: { digest: Digest; open: boolean }) {
  const range = `${fmtDate(d.periodStart).split(",")[0]} – ${fmtDate(d.periodEnd).split(",")[0]}`;
  return (
    <details className="card card-pad" open={open}>
      <summary>
        <span style={{ fontWeight: 600 }}>{range}</span>{" "}
        <span className="faint small">
          · {d.trigger === "manual" ? "Generated manually" : "Weekly"} · {fmtDate(d.createdAt)}
        </span>{" "}
        {d.status === "generating" && <span className="badge blue">Generating</span>}
        {d.status === "failed" && <span className="badge red">Failed</span>}
        {d.status === "ready" && (
          <span className={`badge ${d.source === "ai" ? "violet" : "gray"}`}>{d.source === "ai" ? "AI" : "Summary"}</span>
        )}
      </summary>

      {d.status === "failed" && (
        <p className="notice" style={{ marginTop: 12 }}>
          {d.error}
        </p>
      )}
      {d.status === "generating" && (
        <p className="muted">Crunching this week's numbers. This usually takes under a minute.</p>
      )}

      {d.content && (
        <div className="digest-section">
          <p style={{ fontSize: 16, fontWeight: 500, margin: "14px 0 0" }}>{d.content.headline}</p>

          {d.content.topPerformers.length > 0 && (
            <>
              <h3>Top performers</h3>
              <ul>
                {d.content.topPerformers.map((t) => (
                  <li key={t.videoId}>
                    <Link className="link" href={`/videos/${t.videoId}`}>
                      {t.title}
                    </Link>
                    : {t.why}
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.content.needsAttention.length > 0 && (
            <>
              <h3>Needs attention</h3>
              <ul>
                {d.content.needsAttention.map((t) => (
                  <li key={t.videoId}>
                    <Link className="link" href={`/videos/${t.videoId}`}>
                      {t.title}
                    </Link>
                    : {t.issue}
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.content.creatorComparison.length > 0 && (
            <>
              <h3>Creators</h3>
              <ul>
                {d.content.creatorComparison.map((c) => (
                  <li key={c.creator}>
                    <strong>{c.creator}</strong>: {c.summary}
                  </li>
                ))}
              </ul>
            </>
          )}

          {d.content.patterns.length > 0 && (
            <>
              <h3>Patterns</h3>
              <ul>
                {d.content.patterns.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}

          {d.content.recommendations.length > 0 && (
            <>
              <h3>Recommendations</h3>
              <ul>
                {d.content.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}

          <p className="faint small" style={{ marginTop: 16 }}>
            {d.videoCount} {d.videoCount === 1 ? "video" : "videos"} analyzed{d.model ? ` · ${d.model}` : ""}
          </p>
        </div>
      )}
    </details>
  );
}
