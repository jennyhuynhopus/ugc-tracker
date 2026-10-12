import { db } from "./db";

const JOB_NAME = "ugc-tracker-tick";

export interface SchedulerStatus {
  installed: boolean;
  schedule: string | null;
  lastRun: { status: string; at: string } | null;
  error: string | null;
}

/** Whether the Supabase pg_cron job exists, and how its last run went. */
export async function schedulerStatus(): Promise<SchedulerStatus> {
  try {
    const sql = await db();
    const [ext] = await sql`select 1 from pg_extension where extname = 'pg_cron'`;
    if (!ext) return { installed: false, schedule: null, lastRun: null, error: null };
    const [job] = await sql`select jobid, schedule from cron.job where jobname = ${JOB_NAME}`;
    if (!job) return { installed: false, schedule: null, lastRun: null, error: null };
    const [run] = await sql`
      select status, start_time from cron.job_run_details where jobid = ${job.jobid as number}
      order by start_time desc limit 1`;
    return {
      installed: true,
      schedule: job.schedule as string,
      lastRun: run ? { status: run.status as string, at: (run.startTime as Date).toISOString() } : null,
      error: null,
    };
  } catch (err) {
    return { installed: false, schedule: null, lastRun: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Install (or update) a pg_cron job that POSTs to this app's tick endpoint
 * every 15 minutes, via pg_net. Both extensions ship with Supabase.
 */
export async function installScheduler(appUrl: string, cronSecret: string): Promise<void> {
  const sql = await db();
  await sql`create extension if not exists pg_cron`;
  await sql`create extension if not exists pg_net`;
  const url = new URL("/api/cron/tick", appUrl).toString();
  const headers = JSON.stringify({ Authorization: `Bearer ${cronSecret}`, "Content-Type": "application/json" });
  // cron.schedule takes the command as text; quote values as SQL literals.
  const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const command = `select net.http_post(url := ${lit(url)}, headers := ${lit(headers)}::jsonb, timeout_milliseconds := 290000)`;
  await sql`select cron.schedule(${JOB_NAME}, '*/15 * * * *', ${command})`;
}

export async function removeScheduler(): Promise<void> {
  const sql = await db();
  await sql`select cron.unschedule(jobid) from cron.job where jobname = ${JOB_NAME}`;
}
