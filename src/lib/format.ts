const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function fmtNumber(n: number | null | undefined): string {
  return n == null ? "—" : compact.format(n);
}

export function fmtUsd(n: number | null | undefined): string {
  return n == null ? "—" : usd.format(n);
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  return n == null ? "—" : `${(n * 100).toFixed(digits)}%`;
}

export function fmtRate(perHour: number | null | undefined): string {
  return perHour == null ? "—" : `${compact.format(perHour)}/hr`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}
