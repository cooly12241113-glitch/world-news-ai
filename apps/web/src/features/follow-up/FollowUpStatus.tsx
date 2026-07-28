import type { FollowUpExecutionStatus } from "./follow-up-ui-state";

export function FollowUpStatus({ status }: { status: FollowUpExecutionStatus }) {
  if (status !== "running") return null;
  return <p className="follow-up-status" role="status">Preparing fixture response…</p>;
}
