"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type BulkResult, bulkLogStats } from "@/app/actions";

const PLACEHOLDER = `https://www.tiktok.com/@maya/video/7312345678901234567\t12,345\t800\t40\t25\t60
https://www.instagram.com/reel/C1a2B3c4D5e/\t8.2K\t410\t22
https://youtube.com/shorts/xyz789\t1.2M\t30K\t900`;

const TONE = { logged: "green", not_found: "amber", invalid: "red" } as const;
const LABEL = { logged: "Logged", not_found: "Not found", invalid: "Skipped" } as const;

export function BulkStatsForm() {
  const [state, action, pending] = useActionState<BulkResult, FormData>(bulkLogStats, { error: null, results: [] });
  const logged = state.results.filter((r) => r.status === "logged").length;

  return (
    <div className="stack">
      <form action={action} className="form">
        <label className="field">
          Rows
          <span className="hint">
            One video per line: URL, views, likes, comments, shares, saves. Paste straight from a spreadsheet, or
            separate with commas. Only URL and views are required; 12.3K and 1.2M work.
          </span>
          <textarea
            name="rows"
            rows={10}
            placeholder={PLACEHOLDER}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          />
        </label>
        {state.error && <p className="form-error">{state.error}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Logging…" : "Log stats"}
          </button>
        </div>
      </form>

      {state.results.length > 0 && (
        <section className="card">
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <h2 style={{ margin: 0 }}>
              Logged {logged} of {state.results.length} rows
            </h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Video</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {state.results.map((r) => (
                  <tr key={r.line}>
                    <td className="muted">{r.line}</td>
                    <td className="cell-title">
                      {r.videoId ? (
                        <Link className="link" href={`/videos/${r.videoId}`}>
                          {r.label}
                        </Link>
                      ) : (
                        r.label
                      )}
                    </td>
                    <td>
                      <span className={`badge ${TONE[r.status]}`}>{LABEL[r.status]}</span>
                    </td>
                    <td className="muted">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
