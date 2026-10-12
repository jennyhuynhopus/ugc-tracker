"use client";

import { useActionState, useState } from "react";
import { addCreator, type FormState } from "@/app/actions";
import { PLATFORM_LABELS, parseProfileUrl } from "@/lib/domain";
import { PlatformIcon } from "./icons";

const PLACEHOLDER = `https://www.tiktok.com/@mayamakes
https://www.instagram.com/maya.makes/
https://www.youtube.com/@mayamakes`;

/** Live preview of which platform each pasted link belongs to. */
export function DetectedLinks({ value }: { value: string }) {
  const words = value.split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {words.map((w, i) => {
        const p = parseProfileUrl(w);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: preview rows follow input order
          <div key={i} className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {p ? (
              <>
                <span style={{ width: 16, height: 16, display: "inline-flex" }}><PlatformIcon platform={p.platform} /></span>
                <strong>{PLATFORM_LABELS[p.platform]}</strong> <span className="muted">@{p.handle}</span>
              </>
            ) : (
              <span className="form-error">Not a profile link: {w.slice(0, 50)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CreatorForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addCreator, { error: null });
  const [links, setLinks] = useState("");
  return (
    <form action={action} className="form">
      <label className="field">
        Creator name
        <input name="name" placeholder="Maya Chen" />
        <span className="hint">Leave blank to use the name from their profile.</span>
      </label>
      <label className="field">
        Profile links
        <span className="hint">One link per line, one for each platform they're on.</span>
        <textarea
          name="links"
          rows={4}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder={PLACEHOLDER}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
        />
      </label>
      <DetectedLinks value={links} />
      <label className="field">
        Rate per video (USD)
        <input name="rateUsd" inputMode="decimal" placeholder="Optional" />
      </label>
      <label className="field">
        Notes
        <textarea name="contractNotes" rows={2} placeholder="Usage rights, deliverables… (optional)" />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Looking up profiles…" : "Add creator"}
        </button>
      </div>
    </form>
  );
}
