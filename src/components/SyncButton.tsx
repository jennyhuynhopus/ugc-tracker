"use client";

import { useActionState } from "react";
import { type SyncState, syncAllCreatorsNow, syncCreatorNow } from "@/app/actions";

export function SyncButton({ creatorId, label = "Sync videos now" }: { creatorId?: string; label?: string }) {
  const [state, action, pending] = useActionState<SyncState>(
    () => (creatorId ? syncCreatorNow(creatorId) : syncAllCreatorsNow()),
    { error: null, message: null },
  );
  return (
    <form action={action} style={{ display: "grid", gap: 6, justifyItems: "start" }}>
      <button type="submit" className="btn btn-sm" disabled={pending}>
        {pending ? "Pulling videos…" : label}
      </button>
      {state.message && <span className="small muted">{state.message}</span>}
      {state.error && <span className="small form-error">{state.error}</span>}
    </form>
  );
}
