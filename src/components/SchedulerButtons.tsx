"use client";

import { useActionState } from "react";
import { type FormState, turnOffAutomaticChecks, turnOnAutomaticChecks } from "@/app/actions";

export function SchedulerButtons({ installed }: { installed: boolean }) {
  const [state, action, pending] = useActionState<FormState>(
    installed ? turnOffAutomaticChecks : turnOnAutomaticChecks,
    { error: null },
  );
  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <div>
        <button type="submit" className={`btn ${installed ? "" : "btn-primary"}`} disabled={pending}>
          {pending ? "Working…" : installed ? "Turn off automatic checks" : "Turn on automatic checks"}
        </button>
      </div>
      {state.error && <p className="form-error">{state.error}</p>}
    </form>
  );
}
