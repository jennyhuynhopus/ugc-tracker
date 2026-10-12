"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addCreatorLinks,
  deleteCreator,
  type FormState,
  removeCreatorPlatform,
  updateCreatorDetails,
} from "@/app/actions";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain";
import { DetectedLinks } from "./CreatorForm";

export function AddLinksForm({ creatorId }: { creatorId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addCreatorLinks.bind(null, creatorId), { error: null });
  const [links, setLinks] = useState("");
  return (
    <form
      action={async (fd) => {
        await action(fd);
        setLinks("");
      }}
      className="form"
    >
      <label className="field">
        Add a platform
        <textarea
          name="links"
          rows={2}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder="https://www.instagram.com/handle/"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
        />
      </label>
      <DetectedLinks value={links} />
      {state.error && <p className="notice">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending || !links.trim()}>
          {pending ? "Looking up…" : "Add link"}
        </button>
      </div>
    </form>
  );
}

export function RemovePlatformButton({ creatorId, platform }: { creatorId: string; platform: Platform }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove the ${PLATFORM_LABELS[platform]} profile from this creator?`)) {
          start(() => removeCreatorPlatform(creatorId, platform));
        }
      }}
    >
      Remove
    </button>
  );
}

export function EditCreatorForm(props: { creatorId: string; name: string; rateUsd: number | null; contractNotes: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCreatorDetails.bind(null, props.creatorId), {
    error: null,
  });
  return (
    <form action={action} className="form">
      <label className="field">
        Name
        <input name="name" defaultValue={props.name} required />
      </label>
      <label className="field">
        Rate per video (USD)
        <input name="rateUsd" inputMode="decimal" defaultValue={props.rateUsd ?? ""} />
      </label>
      <label className="field">
        Notes
        <textarea name="contractNotes" rows={3} defaultValue={props.contractNotes} />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <div>
        <button type="submit" className="btn btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function DeleteCreatorButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete ${name}? Their videos and stats are deleted too.`)) start(() => deleteCreator(id));
      }}
    >
      {pending ? "Deleting…" : "Delete creator"}
    </button>
  );
}
