# UGC Tracker

Track UGC creator videos from brief to payout, pull their stats automatically,
and get a weekly digest.

- **Pipeline:** Briefed → Draft submitted → In review → Changes requested → Approved → Posted → Paid, timestamped at every step.
- **Automatic stats:** after a video is posted, it's checked every 15 min for 6 hours, hourly to day 3, then daily to day 30.
  TikTok, Instagram and Facebook use ScrapeCreators; YouTube uses ScrapeCreators or the free YouTube Data API.
- **Performance labels:** Warming up, Breaking out (1.5× your team's median first-day views/hour), Steady, Stalled.
- **Metrics:** views/hour, engagement, share and save rates, cost per 1K views (CPM), and creators ranked by CPM.
- **Creators by profile link:** add a creator with one link per platform; their videos from the last 30 days are pulled in and refreshed hourly.
- **No key needed to start:** log stats per video, or paste rows from a spreadsheet.
- **Weekly digest (Mondays 9am PT):** AI-written with a Claude key; otherwise built from the numbers.

Stack: Next.js on Vercel, Postgres (Supabase), Supabase `pg_cron` for the 15-minute schedule.

## Put it online (about 15 minutes)

1. **Database:** create a free project at [supabase.com](https://supabase.com). Then go to **Connect → Transaction pooler**
   and copy the connection string, swapping in your database password. Tables are created automatically on first use.
2. **Deploy:** run `npx vercel` in this folder and sign in. Then add the variables from `.env.example`
   (`DATABASE_URL`, `APP_PASSWORD`, `CRON_SECRET`, `SCRAPECREATORS_API_KEY`, plus the optional ones)
   under **Project → Settings → Environment Variables**, or with `npx vercel env add NAME production`.
   Finish with `npx vercel --prod`.
3. **Turn on automatic checks:** open the live site, go to **Settings**, and click **Turn on automatic checks**.
   This installs the 15-minute schedule in Supabase. (Vercel also runs a daily backup check on its free plan.)

## Run locally (one command)

```bash
npm install
npm run local        # → http://localhost:3200
```

This starts an embedded Postgres saved in `.localdb/`, the site, and the 15-minute stats check.
Put `SCRAPECREATORS_API_KEY=...` in `.env.local` (gitignored) to pull stats automatically.
No password is needed locally.

## Checks

```bash
npm test          # domain logic: URL parsing, pipeline, poll cadence, metrics, bulk paste
npm run typecheck
npm run build
```
