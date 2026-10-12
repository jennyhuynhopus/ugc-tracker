"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { generateDigestNow } from "@/app/actions";

export function GenerateDigestButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      onClick={() => start(() => generateDigestNow().then(() => {}))}
    >
      {pending ? "Starting…" : "Generate now"}
    </button>
  );
}

/** Refresh the server-rendered list while a digest is generating. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
