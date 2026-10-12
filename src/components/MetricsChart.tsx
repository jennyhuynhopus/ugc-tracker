"use client";

import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function MetricsChart({ series }: { series: { day: string; posted: number; views: number }[] }) {
  return (
    <section className="card card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Metrics</h2>
        <div className="legend">
          <span className="legend-chip posts"><i />Posted videos</span>
          <span className="legend-chip views"><i />Views</span>
        </div>
      </div>
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="postsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-bar)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-bar)" stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={dayLabel} stroke="var(--text-3)" fontSize={12} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis yAxisId="views" tickFormatter={(v) => compact.format(v)} stroke="var(--text-3)" fontSize={12} tickLine={false} axisLine={false} width={48} />
            <YAxis yAxisId="posts" orientation="right" allowDecimals={false} stroke="var(--text-3)" fontSize={12} tickLine={false} axisLine={false} width={32} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelFormatter={(d) => dayLabel(String(d))}
              formatter={(v, name) => [compact.format(Number(v)), name === "views" ? "Views" : "Posted videos"]}
            />
            <Bar yAxisId="posts" dataKey="posted" fill="url(#postsFill)" stroke="var(--chart-bar)" strokeWidth={0} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false} />
            <Area yAxisId="views" type="monotone" dataKey="views" stroke="var(--chart-line)" strokeWidth={2.5} fill="url(#viewsFill)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
