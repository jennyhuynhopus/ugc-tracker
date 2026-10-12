import { SchedulerButtons } from "@/components/SchedulerButtons";
import { fmtRelative } from "@/lib/format";
import { schedulerStatus } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <span className={`badge ${ok ? "green" : "gray"}`}>{ok ? "Connected" : "Not set"}</span>
        <div className="faint small" style={{ marginTop: 2 }}>{detail}</div>
      </dd>
    </>
  );
}

export default async function SettingsPage() {
  const env = (k: string) => Boolean(process.env[k]);
  const scheduler = await schedulerStatus();

  return (
    <main style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>What's connected. Keys are set in your hosting provider's environment variables, never here.</p>
        </div>
      </div>

      <div className="stack">
        <section className="card card-pad">
          <h2>Connections</h2>
          <dl className="dl">
            <Status ok={env("DATABASE_URL")} label="Database" detail="DATABASE_URL: where everything is saved." />
            <Status ok={env("SCRAPECREATORS_API_KEY")} label="ScrapeCreators" detail="Automatic stats for TikTok, Instagram, Facebook (and YouTube)." />
            <Status ok={env("YOUTUBE_API_KEY")} label="YouTube Data API" detail="Optional. Free YouTube stats that save ScrapeCreators credits." />
            <Status ok={env("ANTHROPIC_API_KEY")} label="Claude" detail="Optional. AI-written digests; without it, digests use the numbers only." />
            <Status ok={env("APP_PASSWORD")} label="Team password" detail="APP_PASSWORD: without it, anyone with the link can open the app." />
          </dl>
        </section>

        <section className="card card-pad">
          <h2>Automatic checks</h2>
          <p className="muted" style={{ marginTop: -4 }}>
            Every 15 minutes your database pings this app to refresh stats for posted videos (15 min for 6h, hourly to day
            3, daily to day 30), and writes the weekly digest on Mondays at 9am PT.
          </p>
          {scheduler.error ? (
            <p className="notice">Couldn't check the schedule: {scheduler.error}</p>
          ) : scheduler.installed ? (
            <p>
              <span className="badge green">On</span>{" "}
              <span className="muted small">
                {scheduler.lastRun ? `Last run ${fmtRelative(scheduler.lastRun.at)} (${scheduler.lastRun.status})` : "Waiting for the first run"}
              </span>
            </p>
          ) : (
            <p><span className="badge gray">Off</span> <span className="muted small">Stats only update when you log them or click Refresh on a video.</span></p>
          )}
          <SchedulerButtons installed={scheduler.installed} />
        </section>
      </div>
    </main>
  );
}
