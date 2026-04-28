import { Link } from "react-router-dom";

export function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 12h14" strokeLinecap="round" />
          <path d="m13 6 6 6-6 6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-500">{description}</p>
      {cta && (
        <Link to={cta.to} className="btn-primary mt-5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
