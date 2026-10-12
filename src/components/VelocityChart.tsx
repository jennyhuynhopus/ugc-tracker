"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  views: number;
  perHour: number | null;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function VelocityChart({ points, postedAt }: { points: ChartPoint[]; postedAt: string | null }) {
  if (points.length < 2) {
    return (
      <div className="empty" style={{ padding: "40px 16px" }}>
        <h3>Not enough data yet</h3>
        <p>The chart appears after the second snapshot.</p>
      </div>
    );
  }
  const start = postedAt ? new Date(postedAt).getTime() : points[0].t;
  const hoursSince = (t: number) => (t - start) / 3_600_000;
  const label = (t: number) => {
    const h = hoursSince(t);
    return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  };

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={label}
            stroke="var(--text-3)"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            yAxisId="views"
            tickFormatter={(v) => compact.format(v)}
            stroke="var(--text-3)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tickFormatter={(v) => `${compact.format(v)}/h`}
            stroke="var(--text-3)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(t) => `${new Date(Number(t)).toLocaleString("en-US")} (${label(Number(t))} after posting)`}
            formatter={(v, name) => [
              name === "perHour" ? `${compact.format(Number(v))}/hr` : compact.format(Number(v)),
              name === "perHour" ? "Views per hour" : "Total views",
            ]}
          />
          <Area
            yAxisId="views"
            type="monotone"
            dataKey="views"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.12}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="perHour"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
