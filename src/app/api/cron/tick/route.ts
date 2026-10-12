import { NextResponse } from "next/server";
import { generateDigest, isWeeklyDigestDue } from "@/lib/digest";
import { pollDueVideos } from "@/lib/poll";
import { safeEqual } from "@/lib/session";
import { lastScheduledDigestAt } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One scheduler tick: poll every video that's due, and write the weekly
 * digest once its Monday slot has passed. Called every 15 minutes by
 * Supabase pg_cron (see /settings), and daily by Vercel Cron as a backstop.
 */
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const polls = await pollDueVideos();
  let digest: string | null = null;
  if (isWeeklyDigestDue(Date.now(), await lastScheduledDigestAt())) {
    digest = await generateDigest("schedule");
  }
  return NextResponse.json({ ok: true, ...polls, digest });
}

export const GET = tick;
export const POST = tick;
