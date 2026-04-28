import { useState, type ReactNode } from "react";
import clsx from "clsx";

export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={clsx("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={clsx(
            "pointer-events-none absolute z-50 w-64 rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg",
            side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2",
            side === "bottom" && "left-1/2 top-full mt-2 -translate-x-1/2",
            side === "left" && "right-full top-1/2 mr-2 -translate-y-1/2",
            side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M12 12v4" strokeLinecap="round" />
    </svg>
  );
}
