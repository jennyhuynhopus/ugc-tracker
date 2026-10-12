import {
  PERFORMANCE_LABELS,
  type PerformanceState,
  PIPELINE_LABELS,
  type PipelineState,
  PLATFORM_LABELS,
  type Platform,
} from "@/lib/domain";

const PIPELINE_TONE: Record<PipelineState, string> = {
  briefed: "gray",
  draft_submitted: "blue",
  in_review: "violet",
  changes_requested: "amber",
  approved: "green",
  posted: "blue",
  paid: "green",
};

const PERFORMANCE_TONE: Record<PerformanceState, string> = {
  warming_up: "gray",
  breaking_out: "green",
  steady: "blue",
  stalled: "red",
};

export function PipelineBadge({ state }: { state: PipelineState }) {
  return <span className={`badge ${PIPELINE_TONE[state]}`}>{PIPELINE_LABELS[state]}</span>;
}

export function PerformanceBadge({ state }: { state: PerformanceState | null }) {
  if (!state) return <span className="faint">—</span>;
  return <span className={`badge ${PERFORMANCE_TONE[state]}`}>{PERFORMANCE_LABELS[state]}</span>;
}

export function PlatformLabel({ platform }: { platform: Platform | null }) {
  return <span className="muted">{platform ? PLATFORM_LABELS[platform] : "—"}</span>;
}
