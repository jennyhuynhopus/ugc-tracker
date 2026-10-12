"use client";

import { useActionState, useEffect, useRef } from "react";
import { PLATFORM_LABELS, PLATFORMS } from "@/lib/domain";
import { createCreator, type FormState } from "@/app/actions";

export function CreatorForm() {
  const [state, action, pending] = useActionState<FormState & { ok?: number }, FormData>(
    async (prev, form) => ({ ...(await createCreator(prev, form)), ok: Date.now() }),
    { error: null },
  );
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !state.error) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="form">
      <div className="form-row">
        <label className="field">
          Name
          <input name="name" placeholder="Maya Chen" required />
        </label>
        <label className="field">
          Rate per video (USD)
          <input name="rateUsd" inputMode="decimal" placeholder="300" />
        </label>
      </div>
      <div className="form-row">
        {PLATFORMS.map((p) => (
          <label key={p} className="field">
            {PLATFORM_LABELS[p]} handle
            <input name={`handle_${p}`} placeholder="@handle" />
          </label>
        ))}
      </div>
      <label className="field">
        Contract notes
        <textarea name="contractNotes" placeholder="Usage rights, exclusivity, deliverables…" />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add creator"}
        </button>
      </div>
    </form>
  );
}
