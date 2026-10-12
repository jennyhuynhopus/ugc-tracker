"use client";

import { useActionState, useTransition } from "react";
import { PIPELINE_LABELS, PIPELINE_TRANSITIONS, type PipelineState } from "@/lib/domain";
import { deleteVideo, type FormState, logSnapshot, refreshStatsNow, transitionVideo, updateVideoDetails } from "@/app/actions";

const NEXT_LABEL: Partial<Record<PipelineState, string>> = {
  draft_submitted: "Mark draft submitted",
  in_review: "Start review",
  changes_requested: "Request changes",
  approved: "Approve",
  posted: "Mark posted",
  paid: "Mark paid",
};

export function TransitionButtons({
  videoId,
  state,
  hasUrl,
}: {
  videoId: string;
  state: PipelineState;
  hasUrl: boolean;
}) {
  const [result, run, pending] = useActionState<FormState, PipelineState>((_prev, to) => transitionVideo(videoId, to), {
    error: null,
  });
  const next = PIPELINE_TRANSITIONS[state];
  if (next.length === 0) return <p className="muted small">Paid. Nothing left to do in the pipeline.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {next.map((to) => (
          <form key={to} action={() => run(to)}>
            <button
              type="submit"
              className={`btn btn-sm ${to === "changes_requested" ? "" : "btn-primary"}`}
              disabled={pending || (to === "posted" && !hasUrl)}
              title={to === "posted" && !hasUrl ? "Add the posted URL first" : undefined}
            >
              {NEXT_LABEL[to] ?? PIPELINE_LABELS[to]}
            </button>
          </form>
        ))}
      </div>
      {state === "approved" && !hasUrl && <p className="muted small">Add the posted URL below to mark it posted.</p>}
      {result.error && <p className="form-error">{result.error}</p>}
    </div>
  );
}

export function EditVideoForm(props: {
  videoId: string;
  title: string;
  url: string | null;
  costUsd: number | null;
  postedAt: string | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateVideoDetails.bind(null, props.videoId), {
    error: null,
  });
  // datetime-local wants local time without zone.
  const posted = props.postedAt ? toLocalInput(props.postedAt) : "";
  return (
    <form action={action} className="form">
      <label className="field">
        Title
        <input name="title" defaultValue={props.title} required />
      </label>
      <label className="field">
        Posted URL
        <input name="url" defaultValue={props.url ?? ""} placeholder="https://…" />
      </label>
      <div className="form-row">
        <label className="field">
          Cost (USD)
          <input name="costUsd" inputMode="decimal" defaultValue={props.costUsd ?? ""} />
        </label>
        <label className="field">
          Posted at
          <input name="postedAt" type="datetime-local" defaultValue={posted} />
        </label>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export function SnapshotForm({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logSnapshot.bind(null, videoId), {
    error: null,
  });
  return (
    <form action={action} className="form">
      <div className="form-row">
        {(["views", "likes", "comments", "shares", "saves"] as const).map((k) => (
          <label key={k} className="field">
            {k[0].toUpperCase() + k.slice(1)}
            <input
              name={k}
              inputMode="numeric"
              required={k === "views"}
              placeholder={k === "views" ? "Required" : "—"}
            />
          </label>
        ))}
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending}>
          {pending ? "Logging…" : "Log stats"}
        </button>
      </div>
    </form>
  );
}

export function DeleteVideoButton({ videoId }: { videoId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this video and stop tracking it? Its snapshots stay in the database.")) {
          start(() => deleteVideo(videoId));
        }
      }}
    >
      Delete video
    </button>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RefreshStatsButton({ videoId }: { videoId: string }) {
  const [state, run, pending] = useActionState<FormState>(() => refreshStatsNow(videoId), { error: null });
  return (
    <form action={run} style={{ marginTop: 12 }}>
      <button type="submit" className="btn btn-sm" disabled={pending}>
        {pending ? "Refreshing…" : "Refresh stats now"}
      </button>
      {state.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}
