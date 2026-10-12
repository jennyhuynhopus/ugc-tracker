"use client";

import { useTransition } from "react";
import { deleteCreator } from "@/app/actions";

export function DeleteCreatorButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove ${name}? Their videos and stats are removed too.`)) start(() => deleteCreator(id));
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
