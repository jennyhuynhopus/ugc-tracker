import Link from "next/link";
import type { Kpi, Overview } from "@/lib/analytics";
import { fmtNumber } from "@/lib/format";
import { IconFlame, PlatformIcon } from "./icons";

export function KpiCard({
  label,
  kpi,
  icon,
  format = fmtNumber,
  href,
}: {
  label: string;
  kpi: Kpi;
  icon: React.ReactNode;
  format?: (n: number) => string;
  href?: string;
}) {
  const diff = kpi.value - kpi.prev;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const body = (
    <div className="card warm kpi-card">
      <div className="tile">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-row">
          <span className="kpi-value">{format(kpi.value)}</span>
          <span className={`delta ${tone}`} title="Change vs the previous period">
            {sign}
            {format(Math.abs(diff))}
          </span>
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const PALETTE = ["#f97316", "#3b82f6", "#a855f7", "#10b981", "#ec4899", "#eab308", "#06b6d4"];
function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function Thumb({ platform, externalId }: { platform: Overview["topVideos"][number]["video"]["platform"]; externalId: string | null }) {
  // YouTube thumbnails are public and stable by video id; other platforms show an icon.
  if (platform === "youtube" && externalId) {
    return (
      <div className="thumb">
        {/* biome-ignore lint/performance/noImgElement: remote thumbnail */}
        <img src={`https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`} alt="" loading="lazy" />
      </div>
    );
  }
  return (
    <div className="thumb">
      <PlatformIcon platform={platform} />
    </div>
  );
}

export function TopVideos({ items, days }: { items: Overview["topVideos"]; days: number }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Top videos</h2>
        <span className="muted small">Views gained, last {days} days</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">No views recorded in this period yet.</p>
      ) : (
        items.slice(0, 5).map(({ video, creatorName, views }) => (
          <Link key={video.id} href={`/videos/${video.id}`} className="list-row">
            <Thumb platform={video.platform} externalId={video.externalId} />
            <div className="list-main">
              <div className="list-title">{video.caption?.split("\n")[0] || video.title}</div>
              <div className="list-sub">
                <PlatformIcon platform={video.platform} />
                {creatorName}
              </div>
            </div>
            <span className="list-value">{fmtNumber(views)}</span>
          </Link>
        ))
      )}
    </section>
  );
}

export function TopCreators({ items, days }: { items: Overview["topCreators"]; days: number }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Top creators</h2>
        <span className="muted small">Views gained, last {days} days</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">No creator activity in this period yet.</p>
      ) : (
        items.slice(0, 5).map(({ creator, views, videos }) => {
          const handle = Object.values(creator.handles)[0];
          return (
            <Link key={creator.id} href="/creators" className="list-row">
              <div className="avatar" style={{ background: colorFor(creator.id) }}>{initials(creator.name)}</div>
              <div className="list-main">
                <div className="list-title">{creator.name}</div>
                <div className="list-sub">
                  {handle ? `@${handle} · ` : ""}
                  {videos} posted
                </div>
              </div>
              <span className="list-value">{fmtNumber(views)}</span>
            </Link>
          );
        })
      )}
    </section>
  );
}

export function PostActivity({ heatmap, streak }: { heatmap: Overview["heatmap"]; streak: number }) {
  const max = Math.max(1, ...heatmap.map((h) => h.count));
  const level = (c: number) => (c <= 0 ? "" : ` l${Math.min(4, Math.ceil((c / max) * 4))}`);
  return (
    <section className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Post activity</h2>
        {streak > 0 && (
          <span className="streak">
            <IconFlame />
            {streak}-day posting streak
          </span>
        )}
      </div>
      <div className="heat-wrap">
        <div className="heat-days">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday labels
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="heatmap">
          {heatmap.map((h) => (
            <span
              key={h.day}
              className={`heat${h.count < 0 ? " future" : level(h.count)}`}
              title={h.count < 0 ? undefined : `${h.day}: ${h.count} ${h.count === 1 ? "post" : "posts"}`}
            />
          ))}
        </div>
      </div>
      <div className="heat-legend">
        Fewer posts
        {["", " l1", " l2", " l3", " l4"].map((l) => (
          <span key={l} className={`heat${l}`} />
        ))}
        More posts
      </div>
    </section>
  );
}
