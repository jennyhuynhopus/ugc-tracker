import Link from "next/link";
import { IconAll, IconAt, IconComment, IconHeart, IconPlay, IconPulse, IconVideo, PlatformIcon } from "@/components/icons";
import { MetricsChart } from "@/components/MetricsChart";
import { KpiCard, PostActivity, TopCreators, TopVideos } from "@/components/Overview";
import { getOverview } from "@/lib/data";
import { PLATFORM_LABELS, PLATFORMS, type Platform } from "@/lib/domain";

export const dynamic = "force-dynamic";

const RANGES = [7, 14, 30, 90] as const;

type Search = Promise<{ days?: string; platform?: string }>;

export default async function OverviewPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as (typeof RANGES)[number]) ? Number(sp.days) : 14;
  const platform = PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : null;
  const o = await getOverview(days, platform);

  const href = (next: { days?: number; platform?: Platform | null }) => {
    const q = new URLSearchParams();
    const d = next.days ?? days;
    const p = next.platform === undefined ? platform : next.platform;
    if (d !== 14) q.set("days", String(d));
    if (p) q.set("platform", p);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  };
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="crumbs">
        <span>Analytics</span>
        <span className="sep">›</span>
        <strong>Overview</strong>
        <span className="spacer" />
        <Link href="/videos/new" className="btn btn-primary btn-sm">Add video</Link>
      </div>

      <div className="toolbar">
        <nav className="seg" aria-label="Platform">
          <Link href={href({ platform: null })} aria-current={platform === null ? "true" : undefined} title="All platforms">
            <IconAll />
          </Link>
          {PLATFORMS.map((p) => (
            <Link key={p} href={href({ platform: p })} aria-current={platform === p ? "true" : undefined} title={PLATFORM_LABELS[p]}>
              <PlatformIcon platform={p} />
            </Link>
          ))}
        </nav>
        <nav className="seg" aria-label="Date range">
          {RANGES.map((d) => (
            <Link key={d} href={href({ days: d })} aria-current={days === d ? "true" : undefined}>
              {d} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Posted videos" kpi={o.kpis.posted} icon={<IconVideo />} format={String} href="/videos" />
        <KpiCard label="Active creators" kpi={o.kpis.activeCreators} icon={<IconAt />} format={String} href="/creators" />
        <KpiCard label="Views" kpi={o.kpis.views} icon={<IconPlay />} />
        <KpiCard label="Likes" kpi={o.kpis.likes} icon={<IconHeart />} />
        <KpiCard label="Comments" kpi={o.kpis.comments} icon={<IconComment />} />
        <KpiCard label="Engagement" kpi={o.kpis.engagement} icon={<IconPulse />} format={pct} />
      </div>

      <MetricsChart series={o.series} />

      <div className="grid-halves">
        <TopVideos items={o.topVideos} days={days} />
        <TopCreators items={o.topCreators} days={days} />
      </div>

      <PostActivity heatmap={o.heatmap} streak={o.streak} />
    </div>
  );
}
