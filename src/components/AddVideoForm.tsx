"use client";

import { useActionState, useState } from "react";
import { PIPELINE_LABELS, PIPELINE_STATES, PLATFORM_LABELS, parseVideoUrl } from "@/lib/domain";
import { createVideo, type FormState } from "@/app/actions";

interface CreatorOption {
  id: string;
  name: string;
  rateUsd: number | null;
}

export function AddVideoForm({ creators }: { creators: CreatorOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createVideo, { error: null });
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState("briefed");
  const [creatorId, setCreatorId] = useState(creators[0]?.id ?? "");
  const detected = url ? parseVideoUrl(url) : null;
  const rate = creators.find((c) => c.id === creatorId)?.rateUsd;

  return (
    <form action={action} className="form">
      <div className="form-row">
        <label className="field">
          Creator
          <select name="creatorId" value={creatorId} onChange={(e) => setCreatorId(e.target.value)} required>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Stage
          <select name="pipelineState" value={stage} onChange={(e) => setStage(e.target.value)}>
            {PIPELINE_STATES.filter((s) => s !== "changes_requested").map((s) => (
              <option key={s} value={s}>
                {PIPELINE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Title
        <input name="title" placeholder="e.g. Morning routine hook test" required />
      </label>
      <label className="field">
        Posted URL{" "}
        {stage === "posted" || stage === "paid" ? "" : <span className="hint">Optional until it's posted</span>}
        <input
          name="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@creator/video/…"
          required={stage === "posted" || stage === "paid"}
        />
        {url && (
          <span className="hint">
            {detected
              ? `Detected ${PLATFORM_LABELS[detected.platform]}`
              : "Not a YouTube, TikTok, Instagram or Facebook URL"}
          </span>
        )}
      </label>
      <label className="field">
        Cost (USD){" "}
        <span className="hint">{rate != null ? `Defaults to the creator's rate, $${rate}` : "Used for CPM"}</span>
        <input name="costUsd" inputMode="decimal" placeholder={rate != null ? String(rate) : "250"} />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add video"}
        </button>
      </div>
    </form>
  );
}
