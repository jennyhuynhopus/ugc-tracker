"use client";

import { useActionState, useEffect, useRef } from "react";
import { type AddCreatorsResult, addCreators } from "@/app/actions";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/domain";

const PLACEHOLDER = `https://www.tiktok.com/@mayamakes
https://www.instagram.com/leo.edits/  https://www.tiktok.com/@leoedits
https://www.youtube.com/@avabrooks`;

export function CreatorForm() {
  const [state, action, pending] = useActionState<AddCreatorsResult, FormData>(addCreators, {
    error: null,
    added: [],
    skipped: [],
  });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.added.length && !state.skipped.length) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="form">
      <label className="field">
        Profile links
        <span className="hint">
          One creator per line. Same creator on several platforms? Put their links on one line. We fill in the name and
          follower count from the profile.
        </span>
        <textarea name="links" rows={6} placeholder={PLACEHOLDER} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} required />
      </label>
      <div className="form-row">
        <label className="field">
          Platform for @handles
          <select name="platform" defaultValue="">
            <option value="">Links only</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Rate per video (USD)
          <input name="rateUsd" inputMode="decimal" placeholder="Optional" />
        </label>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Looking up profiles…" : "Add creators"}
        </button>
      </div>
      {(state.added.length > 0 || state.skipped.length > 0) && (
        <div className="stack" style={{ gap: 6 }}>
          {state.added.map((a) => (
            <div key={a.name + a.detail} className="small">
              <span className="badge green">Added</span> <strong>{a.name}</strong> <span className="muted">{a.detail}</span>
            </div>
          ))}
          {state.skipped.map((s) => (
            <div key={s.line} className="small">
              <span className="badge amber">Skipped</span> <span className="muted">{s.line.slice(0, 60)}: {s.reason}</span>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
