import clsx from "clsx";
import { NavLink } from "react-router-dom";

import { useDataset } from "../store/DatasetContext";

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  requiresProfile?: boolean;
  requiresAnalysis?: boolean;
}

const ITEMS: NavItem[] = [
  {
    to: "/upload",
    label: "Upload",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 5v10" strokeLinecap="round" />
        <path d="m8 9 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/profile",
    label: "Profile",
    requiresProfile: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/analyze",
    label: "Analyze",
    requiresProfile: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M4 19V8" strokeLinecap="round" />
        <path d="M10 19V4" strokeLinecap="round" />
        <path d="M16 19v-7" strokeLinecap="round" />
        <path d="M22 19H2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/mitigate",
    label: "Mitigate",
    requiresProfile: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M12 3v18" strokeLinecap="round" />
        <path d="m4 12 8-8 8 8" strokeLinejoin="round" />
        <path d="M5 17h14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/report",
    label: "Report",
    requiresAnalysis: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M6 3h9l4 4v14H6z" strokeLinejoin="round" />
        <path d="M14 3v5h5" strokeLinejoin="round" />
        <path d="M9 13h7M9 17h7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: "/model-audit",
    label: "Model Audit",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, analysis, reset } = useDataset();
  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 z-30 bg-black/30 lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
      />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-ink-200 bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-ink-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3v18M5 7l7-4 7 4M5 17l7 4 7-4" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">FairAudit</p>
            <p className="text-[11px] text-ink-500">Bias detection toolkit</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {ITEMS.map((item) => {
            const disabled =
              (item.requiresProfile && !profile) ||
              (item.requiresAnalysis && !analysis);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                    disabled
                      ? "pointer-events-none text-ink-300"
                      : isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-700 hover:bg-ink-100",
                  )
                }
              >
                <span className="text-current">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs text-ink-600">
          {profile ? (
            <>
              <p className="font-semibold text-ink-800">Active dataset</p>
              <p className="mt-1 truncate" title={profile.filename}>
                {profile.filename}
              </p>
              <p className="mt-0.5 text-ink-500">
                {profile.rows.toLocaleString()} rows · {profile.cols} cols
              </p>
              <button
                className="mt-2 text-[11px] font-medium text-brand-700 hover:underline"
                onClick={reset}
              >
                Clear dataset
              </button>
            </>
          ) : (
            <p>
              No dataset loaded yet. Drop a CSV on the{" "}
              <span className="font-medium">Upload</span> tab to get started.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
