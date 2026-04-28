import clsx from "clsx";

import type { Severity, Status } from "../types";

export function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; dot: string }> = {
    pass: { label: "Pass", cls: "pill-pass", dot: "bg-ok" },
    warning: { label: "Warning", cls: "pill-warn", dot: "bg-warn" },
    fail: { label: "Fail", cls: "pill-fail", dot: "bg-bad" },
  };
  const cfg = map[status];
  return (
    <span className={cfg.cls}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const map: Record<Severity, { label: string; cls: string }> = {
    critical: { label: "Critical", cls: "severity-critical" },
    warning: { label: "Warning", cls: "severity-warning" },
    info: { label: "Info", cls: "severity-info" },
  };
  const cfg = map[severity];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}
