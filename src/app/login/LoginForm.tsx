"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, { error: null });
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        Team password
        <input name="password" type="password" autoComplete="current-password" required autoFocus />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
